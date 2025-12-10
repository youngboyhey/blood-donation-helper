import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from 'crypto';
import fs from 'fs';
import * as cheerio from 'cheerio';

// Load .env from root
dotenv.config({ path: './.env' });

// --- Configuration ---

const SOURCES = [
    // 官網爬蟲 (官方源)
    { type: 'web', id: 'taipei', name: '台北捐血中心', url: 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284', baseUrl: 'https://www.tp.blood.org.tw' },
    { type: 'web', id: 'hsinchu', name: '新竹捐血中心', url: 'https://www.sc.blood.org.tw/xmdoc?xsmsid=0P066666699492479492', baseUrl: 'https://www.sc.blood.org.tw' },

    // Google 搜尋爬蟲 (針對無彙整頁的縣市，搜尋一週內圖片)
    // 規則：前5-10張，一週內，限定 Instagram 來源
    { type: 'google', id: 'taichung', name: '台中', query: '台中 捐血活動 site:instagram.com' },
    { type: 'google', id: 'changhua', name: '彰化', query: '彰化 捐血活動 site:instagram.com' },
    { type: 'google', id: 'nantou', name: '南投', query: '南投 捐血活動 site:instagram.com' },
    { type: 'google', id: 'yunlin', name: '雲林', query: '雲林 捐血活動 site:instagram.com' },
    { type: 'google', id: 'tainan', name: '台南', query: '台南 捐血活動 site:instagram.com' },
    { type: 'google', id: 'chiayi', name: '嘉義', query: '嘉義 捐血活動 site:instagram.com' },
    { type: 'google', id: 'kaohsiung', name: '高雄', query: '高雄 捐血活動 site:instagram.com' },
    { type: 'google', id: 'pingtung', name: '屏東', query: '屏東 捐血活動 site:instagram.com' },
    { type: 'google', id: 'taitung', name: '台東', query: '台東 捐血活動 site:instagram.com' },
    { type: 'google', id: 'penghu', name: '澎湖', query: '澎湖 捐血活動 site:instagram.com' },
];

// --- Helpers ---

// Load Cookies from ENV or File
async function loadCookies() {
    // 1. Try ENV
    if (process.env.COOKIES_JSON) {
        try {
            return JSON.parse(process.env.COOKIES_JSON);
        } catch (e) {
            console.error("Error parsing COOKIES_JSON env var:", e);
        }
    }
    // 2. Try File
    if (fs.existsSync('cookies.json')) {
        try {
            const data = fs.readFileSync('cookies.json', 'utf8');
            return JSON.parse(data);
        } catch (e) { }
    }
    return [];
}

async function fetchHTMLWithPuppeteer(url) {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Auto-scroll to load dynamic content
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000)); // Wait for render

        const content = await page.content();
        await browser.close();
        return content;
    } catch (e) {
        await browser.close();
        throw e;
    }
}


async function fetchPageImagesWithPuppeteer(url) {
    console.log(`[Puppeteer] Fetching Images: ${url}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Auto-scroll logic to load lazy images
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        // Extract images with dimensions
        const images = await page.evaluate(() => {
            const results = [];
            const seen = new Set();
            // Prioritize content areas
            const selectors = ['div.xccont img', 'div.pt-3 img', 'article img', '.content img', 'img'];

            for (const selector of selectors) {
                const imgs = document.querySelectorAll(selector);
                for (const img of imgs) {
                    const src = img.src || img.dataset.src;
                    if (!src || seen.has(src)) continue;

                    // Filter conditions running in browser context
                    if (!src.startsWith('http')) continue;

                    // Paths check
                    if (!src.includes('file_pool') && !src.includes('upload') &&
                        !src.includes('xmimg') && !src.includes('storage')) continue;

                    // File type check
                    if (src.toLowerCase().endsWith('.svg') || src.toLowerCase().includes('qr') ||
                        src.toLowerCase().includes('logo') || src.toLowerCase().includes('icon')) continue;

                    // Dimension check (Natural size)
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;

                    if (w < 100 || h < 100) continue;

                    // Aspect Ratio Check (The key fix!)
                    // Filter out very tall images (lists/tables)
                    // If Height > 2.2 * Width, it's likely a summary list
                    if (h > w * 2.2) continue;

                    seen.add(src);
                    results.push(src);
                }
            }
            return results;
        });

        await browser.close();
        return images;

    } catch (e) {
        console.error(`[Puppeteer] Failed to extract images ${url}:`, e.message);
        await browser.close();
        return [];
    }
}

// --- Scrapers ---

async function fetchGoogleImages(source) {
    console.log(`[Google] 搜尋: ${source.query}`);
    const cookies = await loadCookies();
    if (cookies.length > 0) {
        console.log(`[Google] 載入 ${cookies.length} 個 cookies`);
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-zygote',
            // '--single-process', // Sometimes causes issues on Windows, limiting if possible
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 搜尋 Google 圖片 (qdr:w = 一週內)
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbm=isch&tbs=qdr:w`;
        console.log(`[Google] URL: ${searchUrl}`);

        // Navigation Retry Logic
        let navSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                navSuccess = true;
                break;
            } catch (e) {
                console.warn(`[Google] Navigation attempt ${attempt + 1} failed: ${e.message}`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!navSuccess) throw new Error("Failed to navigate to Google Images after 3 attempts");

        // 捲動載入更多圖片
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let h = 0;
                const t = setInterval(() => { window.scrollBy(0, 400); h += 400; if (h > 3000) { clearInterval(t); resolve(); } }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        // 1. Collect Candidates directly from Grid (Zero-Click Strategy)
        // We use 'data-docid' container which holds the 'data-lpage' (Source URL)
        console.log(`[Google] 收集圖片來源連結 (Zero-Click Strategy)...`);
        const candidates = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('div[data-docid]'));
            return items.map(div => ({
                id: div.getAttribute('data-docid'),
                sourceUrl: div.getAttribute('data-lpage'), // The Key: Source URL is right here!
                previewUrl: div.querySelector('img') ? div.querySelector('img').src : null
            })).filter(item => item.sourceUrl && item.previewUrl);
        });
        console.log(`[Google] 找到 ${candidates.length} 個潛在圖片來源`);

        const results = [];
        const MAX_INITIAL = 15;
        const MAX_TOTAL = Math.min(candidates.length, 50);
        let processed = 0;

        // 2. Process Candidates
        for (let i = 0; i < MAX_TOTAL && results.length < MAX_INITIAL; i++) {
            const item = candidates[i];

            try {
                // Deduplication Check
                const isDuplicate = results.some(r => r.sourceUrl === item.sourceUrl);
                if (isDuplicate) {
                    console.log(`[Google] 略過重複來源: ${item.sourceUrl.slice(0, 40)}...`);
                    continue;
                }

                let finalImageUrl = item.previewUrl;
                let isOgImage = false;

                // 3. Deep Fetch (Visit Source URL)
                if (item.sourceUrl) {
                    console.log(`[DeepFetch] #${results.length + 1} 訪問: ${item.sourceUrl}`);
                    try {
                        const sourcePage = await browser.newPage();
                        await sourcePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                        // Inject cookies for Instagram access
                        if (cookies.length > 0 && item.sourceUrl.includes('instagram.com')) {
                            try {
                                await sourcePage.setCookie(...cookies.filter(c => c.domain && c.domain.includes('instagram')));
                            } catch (e) { /* ignore cookie errors */ }
                        }

                        // Fast fail timeout, blocked resources
                        await sourcePage.setRequestInterception(true);
                        sourcePage.on('request', (req) => {
                            if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
                                req.abort();
                            } else {
                                req.continue();
                            }
                        });

                        await sourcePage.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                        const ogImage = await sourcePage.evaluate(() => {
                            const getMeta = (prop) => document.querySelector(`meta[property="${prop}"]`)?.content || document.querySelector(`meta[name="${prop}"]`)?.content;
                            let img = getMeta('og:image') || getMeta('twitter:image');
                            if (!img) {
                                const link = document.querySelector('link[rel="image_src"]');
                                if (link) img = link.href;
                            }
                            return img;
                        });

                        if (ogImage && ogImage.startsWith('http')) {
                            console.log(`[DeepFetch] ✓ 成功抓取 og:image`);
                            finalImageUrl = ogImage;
                            isOgImage = true;
                        } else {
                            console.log(`[DeepFetch] 無 og:image，使用預覽圖`);
                        }
                        await sourcePage.close();
                    } catch (err) {
                        console.log(`[DeepFetch] 訪問失敗 (${err.message})，使用預覽圖`);
                        try { const pages = await browser.pages(); if (pages.length > 2) pages[pages.length - 1].close(); } catch (e) { }
                    }
                }

                // 4. Save Result
                results.push({
                    type: 'image',
                    url: finalImageUrl,
                    sourceUrl: item.sourceUrl,
                    isSocialMedia: item.sourceUrl ? (item.sourceUrl.includes('facebook.com') || item.sourceUrl.includes('instagram.com')) : false,
                    isHighRes: isOgImage
                });

            } catch (e) {
                console.log(`[Google] Item Error: ${e.message}`);
            }

            processed++;
            // Small delay to be polite
            await new Promise(r => setTimeout(r, 500));
        }

        console.log(`[Google] 完成: ${results.length} 張圖片`);
        return results;

    } catch (e) {
        console.error(`[Google] 失敗: ${e.message}`);
        return [];
    } finally {
        await browser.close();
    }
}

// Web Scraper - 改進版：過濾總表、專注單場活動海報、日期標題過濾
async function fetchWebImages(source) {
    console.log(`[Web] Scraping: ${source.url}`);
    try {
        const html = await fetchHTMLWithPuppeteer(source.url);
        const $ = cheerio.load(html);
        const targetLinks = [];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        $('a').each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const href = $el.attr('href');
            const titleAttr = $el.attr('title') || ''; // 重要：檢查 title 屬性

            // 合併 text 和 title 進行檢查
            const combinedText = text + ' ' + titleAttr;

            // 1. Check Link & Text Criteria - 必須包含「捐血活動」
            // 嚴格過濾：只有明確標示為「捐血活動」的連結才處理
            if (combinedText.includes('捐血活動') && !combinedText.includes('暫停')) {
                // Exclude Summary/Calendar/News/Report Links
                if (combinedText.includes('總表') || combinedText.includes('行事曆') ||
                    combinedText.includes('一覽') || combinedText.includes('場次表') ||
                    combinedText.includes('月行程') || combinedText.includes('新聞稿') ||
                    combinedText.includes('活動報導') || combinedText.includes('怎麼') ||
                    combinedText.includes('捐血點異動')) {
                    // console.log(`[Web] 跳過非活動連結: ${combinedText.slice(0, 30)}`);
                    return;
                }

                // 2. Date Filtering (Title Based - Enhanced)
                const title = combinedText; // 使用合併後的文字



                // Matches: 114年12月29日, 114/12/29, 12/29, 11-23~12-20
                const dateMatches = title.match(/(\d{2,4})[年\/-](\d{1,2})[月\/-](\d{1,2})/g);
                const shortDateMatches = title.match(/(\d{1,2})[月\/](\d{1,2})/g);

                let hasFutureDate = false;
                let hasDateInfo = false;

                // Function to parse date string to Date object
                const parseDate = (dStr) => {
                    let y, m, d;
                    // Handle 114年...
                    if (dStr.includes('年')) {
                        const parts = dStr.split(/[年月日]/);
                        y = parseInt(parts[0]);
                        m = parseInt(parts[1]);
                        d = parseInt(parts[2]);
                        if (y < 1911) y += 1911; // ROC Year
                    }
                    // Handle YYYY/MM/DD or YY/MM/DD
                    else if (dStr.includes('/') || dStr.includes('-')) {
                        const parts = dStr.split(/[\/-]/);
                        y = parseInt(parts[0]);
                        if (y < 1911 && y > 100) y += 1911;

                        m = parseInt(parts[1]);
                        d = parseInt(parts[2]);
                    }
                    return new Date(y, m - 1, d);
                };

                if (dateMatches) {
                    hasDateInfo = true;
                    for (const match of dateMatches) {
                        try {
                            const evtDate = parseDate(match);
                            if (evtDate >= today) {
                                hasFutureDate = true;
                                break;
                            }
                        } catch (e) { }
                    }
                } else if (shortDateMatches) {
                    hasDateInfo = true;
                    const currentYear = today.getFullYear();
                    for (const match of shortDateMatches) {
                        const parts = match.split(/[\/月]/);
                        const m = parseInt(parts[0]);
                        const d = parseInt(parts[1]);

                        // Try current year
                        let evtDate = new Date(currentYear, m - 1, d);
                        // Heuristic: If date is very far in past (e.g. today is Dec, event is Jan), assume next year.
                        if (evtDate < today && m < today.getMonth()) {
                            evtDate.setFullYear(currentYear + 1);
                        }

                        if (evtDate >= today) {
                            hasFutureDate = true;
                            break;
                        }
                    }
                }

                // Decision Logic
                // Only skip if we found dates AND none were in the future
                if (hasDateInfo && !hasFutureDate) {
                    console.log(`[Web] 跳過過期活動 (Title檢測): ${title.slice(0, 30)}...`);
                    return;
                }

                if (href) targetLinks.push(href.startsWith('http') ? href : source.baseUrl + href);
            }
        });

        const uniqueLinks = [...new Set(targetLinks)].slice(0, 8); // 增加到 8 頁
        console.log(`[Web] 找到 ${uniqueLinks.length} 個活動連結`);
        let allImages = [];

        for (const fullUrl of uniqueLinks) {
            console.log(`[Web] Visiting: ${fullUrl}`);

            // 使用新函式：能過濾長條圖、支援滾動
            const validImageUrls = await fetchPageImagesWithPuppeteer(fullUrl);

            if (validImageUrls.length === 0) {
                console.log(`[Web] 未找到有效海報: ${fullUrl.slice(-30)}`);
                continue;
            }

            const pageImages = validImageUrls.map(url => ({ type: 'image', url, sourceUrl: fullUrl }));

            // 不限制每頁圖片數量，確保抓取所有海報
            allImages = allImages.concat(pageImages);
        }

        // 去重
        const dedupedImages = [...new Map(allImages.map(item => [item.url, item])).values()];
        console.log(`[Web] 收集 ${dedupedImages.length} 張圖片`);
        return dedupedImages;
    } catch (e) {
        return [];
    }
}

// --- AI Logic ---
class QuotaExhaustedError extends Error { constructor(m) { super(m); this.name = "QuotaExhaustedError"; } }

const API_KEYS_STR = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
const API_KEYS = API_KEYS_STR.split(',').map(k => k.trim()).filter(k => k);

// 2. 定義模型 - 使用付費版 Gemini 2.0 Flash
const MODELS = ["gemini-2.0-flash"];

// 3. 輔助函式：取得指定輪替的 Key 與 Model
const getModel = (retryCount) => {
    if (API_KEYS.length === 0) throw new Error("Missing API Key");

    // 邏輯：每把 KEY 都會嘗試過所有 MODELS 後，才切換到下一把 KEY
    const totalModels = MODELS.length;
    const keyIndex = Math.floor(retryCount / totalModels) % API_KEYS.length;
    const modelIndex = retryCount % totalModels;

    const key = API_KEYS[keyIndex];
    const modelName = MODELS[modelIndex];

    const genAI = new GoogleGenerativeAI(key);
    const gen = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: "application/json" } });
    const keyMasked = key.substring(0, 5) + '...';

    return { gen, desc: `Key ${keyMasked} / ${modelName}` };
};

async function fetchImageAsBase64(url, cookies = null) {
    // First try direct fetch
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer': 'https://www.google.com/'
        };

        // Add cookies for social media access
        if (cookies && cookies.length > 0) {
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            headers['Cookie'] = cookieString;
        }

        const res = await fetch(url, { headers });
        if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('image')) {
                const buf = await res.arrayBuffer();
                if (buf.byteLength > 5000) { // At least 5KB
                    return Buffer.from(buf).toString('base64');
                }
            }
        }
    } catch (e) { /* Direct fetch failed, try Puppeteer */ }

    // Fallback: Use Puppeteer to screenshot the image (handles hotlink protection)
    try {
        console.log(`[Image] Direct fetch failed, trying Puppeteer for: ${url.slice(0, 50)}...`);
        const browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Set cookies if available
        if (cookies && cookies.length > 0) {
            try { await page.setCookie(...cookies); } catch (e) { }
        }

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Take screenshot of the image
        const screenshot = await page.screenshot({ encoding: 'base64', type: 'png' });
        await browser.close();

        if (screenshot && screenshot.length > 1000) {
            return screenshot;
        }
    } catch (e) {
        console.warn(`[Image] Puppeteer fallback also failed: ${e.message.slice(0, 50)}`);
    }

    return null;
}

async function analyzeContentWithAI(item, sourceContext) {
    // Use Taiwan Timezone (UTC+8) for AI prompt
    const now = new Date();
    const taiwanOffset = 8 * 60;
    const localOffset = now.getTimezoneOffset();
    const taiwanTime = new Date(now.getTime() + (taiwanOffset + localOffset) * 60 * 1000);
    const today = taiwanTime.toISOString().split('T')[0];

    // Load cookies for social media image access
    const cookies = await loadCookies();

    // API Key Rotation - This section is now handled by global constants and getModel
    // const keys = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
    // if (!keys.length) return null;

    // const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"]; // No 1.5

    // const getModel = (retry) => {
    //     const k = keys[retry % keys.length];
    //     const m = MODELS[Math.floor(retry / keys.length) % MODELS.length];

    //     // Safety: If keys are exhausted for all models? 
    //     // Logic: 2 models * N keys. 
    //     return {
    //         gen: new GoogleGenerativeAI(k).getGenerativeModel({ model: m, generationConfig: { responseMimeType: "application/json" } }),
    //         desc: `${m} w/ Key...${k.slice(-4)}`
    //     };
    // };

    let retries = 0;
    const maxRetries = API_KEYS.length * MODELS.length * 2; // Use the new global API_KEYS and MODELS

    while (retries < maxRetries) {
        let desc = `Retry ${retries}`;
        try {
            const modelInfo = getModel(retries);
            const gen = modelInfo.gen;
            desc = modelInfo.desc;

            if (retries > 0) console.log(`[AI Retry] ${desc}`);

            // Use pre-fetched base64 if available (screenshot), otherwise fetch image
            let base64 = item.base64 || null;
            if (!base64 && item.url) {
                base64 = await fetchImageAsBase64(item.url, cookies);
            }
            if (!base64) return null; // Image load failed

            const prompt = `請分析這張捐血活動海報。
今天是 ${today}。

【嚴格過濾規則 - 重要】
若海報符合以下任一情況，請回傳包含 invalid_reason 的 JSON 物件 (例如: { "invalid_reason": "缺少完整日期" })：
1. **缺少完整日期**：必須有明確的單一日期或多個不連續日期。
2. **日期區間 (Range)**：若日期呈現「區間」形式 (如 12/8~12/12)，這通常是總表或宣傳期，屬於無效。
3. **缺少詳細地點/地址**：必須有具體的活動地點名稱甚至地址。若只有「新竹捐血中心」這種機構名稱而無具體舉辦地點，屬於無效。
4. **已過期**：活動日期早於今日(${today})。
5. **總表/行事曆/多場次** - 這是最嚴格的規則！
   - **混合型檢查**：即使圖片上半部是宣傳插圖，只要下半部是「活動列表」或「表格」，視為無效。
   - **關鍵字檢查**：若圖片中出現「一覽表」、「巡迴表」、「場次表」文字，視為無效。
   - **數量檢查**：若圖片中包含 **2 個以上(含)** 的不同日期或不同地點，視為總表，屬於無效。
   - 禁止將一張列表圖片拆解成單一活動回傳。
   **我只需要「單一場次」的活動海報。**
6. **例行性文字** - 若僅有「每週」或「每月」等例行性說明，無具體日期，屬於無效
7. **圖片無法辨識** - 若圖片是登入畫面、模糊、或非海報內容

**日期推算規則**：
- 若無年份，依今日(${today})推算最近的未來日期。

【地點解析特別指示】
請將地點精確拆分為:
- **city (縣市)**: 例如 "南投縣", "台中市"。若海報寫 "南投市XXX"，City 應為 "南投縣"，District 為 "南投市"。請務必辨識台灣行政區階層。
- **district (行政區)**: 例如 "中寮鄉", "北區"。
- **location**: 完整地點名稱。

請輸出 JSON 陣列，欄位如下：
[
  {
    "title": "活動標題 (若無則使用 '捐血活動')",
    "date": "YYYY-MM-DD (標準格式)",
    "time": "HH:mm-HH:mm (若無則留空)",
    "location": "完整地點名稱",
    "city": "縣市",
    "district": "行政區",
    "organizer": "主辦單位 (若有)",
    "gift": { "name": "贈品名稱 (若有)", "image": null },
    "tags": ["標籤1", "標籤2"]
  }
]

若無效，請回傳:
{ "invalid_reason": "原本應回傳 null 的具體原因" }
`;
            const result = await gen.generateContent([prompt, { inlineData: { data: base64, mimeType: "image/jpeg" } }]);
            const text = result.response.text();

            // Clean markdown JSON
            const jsonText = text.replace(/```json / g, '').replace(/```/g, '').trim();
            let data;
            try {
                data = JSON.parse(jsonText);
            } catch (e) {
                console.warn(`[AI] JSON Parse Fail: ${jsonText.slice(0, 50)}...`);
                return null;
            }

            if (data.invalid_reason) {
                console.log(`[AI Reject] ${data.invalid_reason}`);
                return null;
            }

            return Array.isArray(data) ? data : [data];

        } catch (e) {
            // Enhanced error logging
            const isRateLimit = e.message.includes('429') || e.message.includes('Quota') || e.message.includes('Resource has been exhausted');
            const isInvalidImage = e.message.includes('400') || e.message.includes('image is not valid') || e.message.includes('Bad Request');

            if (isInvalidImage) {
                // Invalid image - skip this image entirely, don't retry
                console.warn(`[AI] Invalid image, skipping: ${e.message.substring(0, 100)}`);
                return null;
            } else if (isRateLimit) {
                console.warn(`[AI] Rate Limit hit (${desc}). Switching...`);
                retries++;
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.warn(`[AI] Analysis Error (${desc}): ${e.message}`);
                retries++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
    throw new QuotaExhaustedError("All keys exhausted");
}

// --- Main Update Logic ---

async function uploadImageToStorage(supabase, imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Download failed');
        const buffer = await response.arrayBuffer();

        // Strict Size Check (Double Check)
        if (buffer.byteLength < 5000) { // < 5KB is likely junk or tiny icon
            // Can't check pixels easily without lib, checking bytes as proxy
            console.log(`[Upload] Skip tiny image (${buffer.byteLength} bytes)`);
            return null;
        }

        const ext = imageUrl.split('.').pop().split(/[?#]/)[0] || 'jpg';
        const filename = `${crypto.createHash('md5').update(imageUrl).digest('hex')}.${ext}`;

        const { data, error } = await supabase.storage.from('posters').upload(filename, buffer, {
            contentType: response.headers.get('content-type') || 'image/jpeg',
            upsert: false // Don't overwrite, if exists, just use it
        });

        // Even if error (duplicate), we can get public url
        const { data: { publicUrl } } = supabase.storage.from('posters').getPublicUrl(filename);
        return publicUrl;
    } catch (e) {
        console.error(`[Upload] Failed: ${e.message}`);
        return null;
    }
}

// --- Deduplication Helpers ---

function normalizeText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, '').replace(/臺/g, '台').toLowerCase();
}

function generateEventKey(evt) {
    // Key: YYYY-MM-DD_City_Location(normalized)
    return `${evt.date}_${normalizeText(evt.city)}_${normalizeText(evt.location)}`;
}

function calculateEventScore(evt) {
    let score = 0;
    if (evt.gift && evt.gift.name) score += 2;
    if (evt.gift && evt.gift.image) score += 3; // Image URL for gift? Or just detecting it?
    if (evt.time && evt.time.length > 3) score += 1;
    if (evt.organizer) score += 1;
    if (evt.tags && evt.tags.length > 0) score += 1;
    if (evt.city && evt.district) score += 1;
    return score;
}

async function updateEvents() {
    let supabase;
    try {
        const sbUrl = process.env.VITE_SUPABASE_URL;
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!sbUrl || !sbKey) {
            console.warn('[Warning] Supabase keys missing. Running in DRY RUN mode (no database writes).');
            const mockBuilder = {
                select: () => mockBuilder,
                lt: () => mockBuilder,
                gte: () => mockBuilder,
                eq: () => mockBuilder,
                upsert: () => mockBuilder,
                remove: () => mockBuilder,
                then: (resolve) => resolve({ data: [], error: null })
            };

            supabase = {
                from: () => mockBuilder,
                storage: {
                    from: () => ({
                        upload: () => ({ data: {}, error: null }),
                        getPublicUrl: () => ({ data: { publicUrl: 'https://mock.url/image.jpg' } }),
                        remove: () => ({ error: null })
                    })
                }
            };
        } else {
            supabase = createClient(sbUrl, sbKey);
        }
    } catch (e) {
        console.warn(`[Init] Supabase Init Failed: ${e.message}`);
        return;
    }

    // Use Taiwan Timezone (UTC+8) for date calculation
    const now = new Date();
    const taiwanOffset = 8 * 60; // UTC+8 in minutes
    const localOffset = now.getTimezoneOffset(); // System offset (negative for UTC+)
    const taiwanTime = new Date(now.getTime() + (taiwanOffset + localOffset) * 60 * 1000);
    taiwanTime.setHours(0, 0, 0, 0);
    const todayStr = taiwanTime.toISOString().split('T')[0];

    // 1. Auto-Delete Expired Events AND their Storage files
    console.log(`[Cleanup] Finding expired events before ${todayStr}...`);

    // First, get the expired events to extract poster_url for storage cleanup
    const { data: expiredEvents, error: fetchErr } = await supabase
        .from('events')
        .select('id, poster_url')
        .lt('date', todayStr);

    if (fetchErr) {
        console.error(`[Cleanup] Failed to fetch expired events: ${fetchErr.message}`);
    } else if (expiredEvents && expiredEvents.length > 0) {
        console.log(`[Cleanup] Found ${expiredEvents.length} expired events to clean up.`);

        // Extract file paths from poster_url for storage deletion
        const filesToDelete = [];
        for (const ev of expiredEvents) {
            if (ev.poster_url && ev.poster_url.includes('/storage/v1/object/public/posters/')) {
                // Extract filename from URL like: .../storage/v1/object/public/posters/1234_filename.jpg
                const parts = ev.poster_url.split('/storage/v1/object/public/posters/');
                if (parts[1]) {
                    filesToDelete.push(parts[1]);
                }
            }
        }

        // Delete files from Storage bucket
        if (filesToDelete.length > 0) {
            console.log(`[Cleanup] Deleting ${filesToDelete.length} files from Storage...`);
            const { error: storageErr } = await supabase.storage
                .from('posters')
                .remove(filesToDelete);

            if (storageErr) {
                console.error(`[Cleanup] Storage cleanup failed: ${storageErr.message}`);
            } else {
                console.log(`[Cleanup] ✓ Deleted ${filesToDelete.length} files from Storage.`);
            }
        }

        // Delete expired events from database
        const { error: delErr } = await supabase.from('events').delete().lt('date', todayStr);
        if (delErr) console.error(`[Cleanup] DB delete failed: ${delErr.message}`);
        else console.log(`[Cleanup] ✓ Deleted ${expiredEvents.length} expired events from DB.`);
    } else {
        console.log(`[Cleanup] No expired events to clean up.`);
    }

    // 2. Load Existing Events (Full Data for Smart Dedupe)
    console.log(`[Dedupe] Loading future events...`);
    const { data: existingEventsData } = await supabase.from('events').select('*').gte('date', todayStr);

    // Map: Key -> { event, score }
    const existingEventsMap = new Map();
    const existingUrlSet = new Set();

    if (existingEventsData) {
        for (const e of existingEventsData) {
            const key = generateEventKey(e);
            const score = calculateEventScore(e);

            // Keep the best one if DB already has dupes (unlikely but safe)
            if (!existingEventsMap.has(key) || score > existingEventsMap.get(key).score) {
                existingEventsMap.set(key, { ...e, _score: score });
            }
            if (e.original_image_url) existingUrlSet.add(e.original_image_url);
        }
    }
    console.log(`[Dedupe] Loaded ${existingEventsMap.size} unique future events.`);

    const eventsToInsert = [];
    const eventsToUpdate = [];

    for (const source of SOURCES) {
        console.log(`\n=== Processing ${source.name} ===`);
        // Rate limit between sources
        if (source !== SOURCES[0]) await new Promise(r => setTimeout(r, 2000));

        let items = [];
        try {
            items = source.type === 'web' ? await fetchWebImages(source) : await fetchGoogleImages(source);
        } catch (e) {
            console.error(`[Fetch] Source failed ${source.id}: ${e.message}`);
            continue;
        }

        let imageIndex = 0;
        for (const item of items) {
            imageIndex++;
            const imgLabel = `[Image ${imageIndex}/${items.length}]`;

            // Level 1 Dedupe: Exact URL match (skip processing entirely if we know we have it)
            // UNLESS we want to re-check if our current version is "bad"?
            // For now, assume if URL matches, we processed it fully before.
            if (existingUrlSet.has(item.url)) {
                console.log(`${imgLabel} Skip: 重複圖片URL`);
                continue;
            }

            console.log(`${imgLabel} 分析中: ${item.sourceUrl?.slice(0, 50) || item.url.slice(0, 50)}...`);

            // AI Analyze
            await new Promise(r => setTimeout(r, 2000)); // Rate limit buffer
            try {
                const results = await analyzeContentWithAI(item, source);

                if (!results) {
                    console.log(`${imgLabel} 結果: AI 回傳 null (不符合條件)`);
                    continue;
                }

                const validEvents = Array.isArray(results) ? results : [results];
                console.log(`${imgLabel} 結果: AI 識別出 ${validEvents.length} 個活動`);

                for (const evt of validEvents) {
                    if (!evt || !evt.date || !evt.location) {
                        console.log(`${imgLabel} Skip: 缺少日期或地點`);
                        continue;
                    }

                    // CRITICAL: Skip expired events (double check AI response)
                    if (evt.date < todayStr) {
                        console.log(`${imgLabel} Skip: 已過期 (${evt.date} < ${todayStr}) - ${evt.location}`);
                        continue;
                    }

                    const newEventScore = calculateEventScore(evt);
                    const eventKey = generateEventKey(evt);

                    // Smart Dedupe Check
                    let isUpdate = false;
                    let shouldSkip = false;

                    if (existingEventsMap.has(eventKey)) {
                        const existing = existingEventsMap.get(eventKey);
                        if (newEventScore > existing._score) {
                            console.log(`${imgLabel} Action: 更新現有活動 (Score ${newEventScore} > ${existing._score}) - ${evt.date} ${evt.location}`);
                            isUpdate = true;
                            evt.id = existing.id; // CRITICAL: Preserve ID to update
                        } else {
                            console.log(`${imgLabel} Skip: 現有版本更好 (Score ${existing._score} >= ${newEventScore}) - ${evt.date} ${evt.location}`);
                            shouldSkip = true;
                        }
                    } else {
                        console.log(`${imgLabel} Action: 新增活動 - ${evt.date} ${evt.location} (Score: ${newEventScore})`);
                    }

                    if (shouldSkip) continue;

                    // New or Better Version Found - Upload Image
                    const storageUrl = await uploadImageToStorage(supabase, item.url);
                    if (!storageUrl) {
                        console.log(`${imgLabel} Skip: 圖片上傳失敗或太小`);
                        continue;
                    }

                    // Prepare Final Object
                    const finalEvent = {
                        ...evt,
                        poster_url: storageUrl,
                        original_image_url: item.url,
                        source_url: evt.sourceUrl || item.sourceUrl,
                        tags: evt.tags || [],
                        updated_at: new Date()
                    };

                    if (!isUpdate) {
                        finalEvent.created_at = new Date(); // Only for new
                    }

                    // Standardize City (Simple Check)
                    if (finalEvent.city && finalEvent.city.includes('市') && !finalEvent.city.includes('縣') && !['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市', '基隆市', '新竹市', '嘉義市'].includes(finalEvent.city)) {
                        // Pass
                    }

                    if (isUpdate) {
                        eventsToUpdate.push(finalEvent);
                        // Update map to prevent other dupes in same run overwriting this best version
                        existingEventsMap.set(eventKey, { ...finalEvent, _score: newEventScore });
                    } else {
                        eventsToInsert.push(finalEvent);
                        existingEventsMap.set(eventKey, { ...finalEvent, _score: newEventScore });
                    }

                    existingUrlSet.add(item.url); // Prevent URL reprocessing
                    console.log(`[${isUpdate ? 'Update' : 'New'}] ${evt.date} ${evt.title} (${evt.city})`);
                }
            } catch (e) {
                if (e.name === 'QuotaExhaustedError') throw e;
                console.error(`[Error] Processing item: ${e.message}`);
            }
        }
    }

    // Batch Operations
    if (eventsToInsert.length > 0) {
        console.log(`[DB] Inserting ${eventsToInsert.length} new events...`);
        for (let i = 0; i < eventsToInsert.length; i += 50) {
            const { error } = await supabase.from('events').insert(eventsToInsert.slice(i, i + 50));
            if (error) console.error(`[DB] Insert failed: ${error.message}`);
        }
    } else {
        console.log(`[DB] No new events to insert.`);
    }

    if (eventsToUpdate.length > 0) {
        console.log(`[DB] Updating ${eventsToUpdate.length} existing events...`);
        for (const evt of eventsToUpdate) {
            // Upsert based on ID
            const { error } = await supabase.from('events').upsert(evt);
            if (error) console.error(`[DB] Update failed for ${evt.id}: ${error.message}`);
        }
    } else {
        console.log(`[DB] No events to update.`);
    }

    // Save crawler status to settings table
    const crawlerStatus = {
        last_run: new Date().toISOString(),
        inserted: eventsToInsert.length,
        updated: eventsToUpdate.length,
        total_events: eventsToInsert.length + eventsToUpdate.length + (existingEventsData?.length || 0),
        status: 'success'
    };

    try {
        const { error: statusError } = await supabase
            .from('settings')
            .upsert(
                {
                    key: 'crawler_status',
                    value: crawlerStatus,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'key' }
            );

        if (statusError) {
            console.error('[Crawler] Failed to save status:', statusError.message);
        } else {
            console.log('[Crawler] ✓ Status saved to Supabase');
        }
    } catch (e) {
        console.error('[Crawler] Exception saving status:', e.message);
    }
}

updateEvents().catch(console.error);
