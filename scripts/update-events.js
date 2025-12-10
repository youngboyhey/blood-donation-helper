import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration & Helpers ---

function sanitizeData(data) {
    if (Array.isArray(data)) return data.map(sanitizeData);
    if (data && typeof data === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
            cleaned[key] = sanitizeData(value);
        }
        return cleaned;
    }
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return null;
        return trimmed;
    }
    return data;
}

const SOURCES = [
    // 官網爬蟲 - 維持原方法
    { type: 'web', id: 'taipei', name: '台北捐血中心', url: 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284', baseUrl: 'https://www.tp.blood.org.tw', city: '台北市' },
    { type: 'web', id: 'hsinchu', name: '新竹捐血中心', url: 'https://www.sc.blood.org.tw/xmdoc?xsmsid=0P066666699492479492', baseUrl: 'https://www.sc.blood.org.tw', city: '新竹市' },
    // Google 圖片統一搜尋 - 新方法
    { type: 'google', id: 'unified', name: 'Google 圖片搜尋', query: '捐血活動', city: null }
];

// Puppeteer Setup
async function fetchHTMLWithPuppeteer(url) {
    console.log(`[Puppeteer] Fetching: ${url}`);
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const content = await page.content();
        await browser.close();
        return content;
    } catch (e) {
        console.error(`[Puppeteer] Failed ${url}:`, e.message);
        await browser.close();
        throw e;
    }
}

async function loadCookies() {
    if (process.env.COOKIES_JSON) {
        try {
            return JSON.parse(process.env.COOKIES_JSON);
        } catch (e) { console.error('[Cookies] Env parse failed'); }
    }
    const cookiePath = path.join(__dirname, '../cookies.json');
    if (fs.existsSync(cookiePath)) {
        try {
            return JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
        } catch (e) { console.error('[Cookies] File read failed'); }
    }
    return [];
}

// Deep Scraping & Validation
async function fetchSourcePage(url, browser, cookies) {
    if (!url || !url.startsWith('http')) return null;
    const page = await browser.newPage();
    try {
        if (cookies && cookies.length) await page.setCookie(...cookies);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

        // Block minimal requests to speed up
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['font', 'stylesheet'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        const largestImage = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            // Strict Size Filter: > 300x300
            const candidates = images.filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.width >= 300 && rect.height >= 300 && img.src.startsWith('http');
            });
            if (!candidates.length) return null;
            candidates.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));
            return candidates[0].src;
        });

        return largestImage;
    } catch (e) {
        // console.error(`[Source] Error ${url}: ${e.message}`);
    } finally {
        await page.close();
    }
    return null;
}

// Google Image Search - 新版：點擊縮圖 → 造訪連結 → 下載圖片
async function fetchGoogleImages(source) {
    console.log(`[Google] 搜尋: ${source.query}`);
    const cookies = await loadCookies();
    if (cookies.length > 0) {
        console.log(`[Google] 載入 ${cookies.length} 個 cookies`);
    }

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 搜尋 Google 圖片 (qdr:w = 一週內)
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbm=isch&tbs=qdr:w`;
        console.log(`[Google] URL: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 處理同意對話框
        try {
            const consentBtn = await page.$('button[id*="accept"], button[aria-label*="Accept"]');
            if (consentBtn) { await consentBtn.click(); await new Promise(r => setTimeout(r, 2000)); }
        } catch (e) { }

        // 捲動載入更多圖片
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let h = 0;
                const t = setInterval(() => { window.scrollBy(0, 400); h += 400; if (h > 3000) { clearInterval(t); resolve(); } }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        // 找到縮圖數量
        const thumbnailCount = await page.$$eval('div[data-id] img, img.rg_i', imgs => imgs.length);
        console.log(`[Google] 找到 ${thumbnailCount} 個縮圖`);

        const results = [];
        const MAX_INITIAL = 30;
        const MAX_TOTAL = Math.min(thumbnailCount, 50);
        let processed = 0;
        let consecutiveErrors = 0;

        for (let i = 0; i < MAX_TOTAL && results.length < MAX_INITIAL; i++) {
            try {
                // 每次重新查詢縮圖（避免 stale element handle）
                const clicked = await page.evaluate((index) => {
                    const thumbnails = document.querySelectorAll('div[data-id] img, img.rg_i');
                    if (thumbnails[index]) {
                        thumbnails[index].click();
                        return true;
                    }
                    return false;
                }, i);

                if (!clicked) {
                    console.log(`[Google] #${i + 1}: 縮圖不存在`);
                    continue;
                }

                await new Promise(r => setTimeout(r, 2000));

                // 從側欄取得高解析度圖片
                const imageInfo = await page.evaluate(() => {
                    // 找側欄中最大的非 Google 圖片
                    const allImgs = document.querySelectorAll('img[src^="http"]');
                    let bestImg = null;
                    let maxArea = 0;

                    for (const img of allImgs) {
                        const rect = img.getBoundingClientRect();
                        const src = img.src || '';

                        // 只要右半邊、大於 200px 的圖片
                        if (rect.left > window.innerWidth * 0.4 &&
                            rect.width > 200 && rect.height > 200) {
                            // 排除 Google 圖片
                            if (src.includes('gstatic.com') || src.includes('google.com') ||
                                src.includes('encrypted-tbn')) continue;

                            const area = rect.width * rect.height;
                            if (area > maxArea) {
                                maxArea = area;
                                bestImg = src;
                            }
                        }
                    }

                    // 找來源連結
                    let sourceUrl = null;
                    const links = document.querySelectorAll('a[href^="http"]:not([href*="google"])');
                    for (const link of links) {
                        const rect = link.getBoundingClientRect();
                        if (rect.left > window.innerWidth * 0.4 && rect.width > 50) {
                            sourceUrl = link.href;
                            break;
                        }
                    }

                    return { imageUrl: bestImg, sourceUrl };
                });

                if (imageInfo.imageUrl) {
                    results.push({
                        type: 'image',
                        url: imageInfo.imageUrl,
                        sourceUrl: imageInfo.sourceUrl || null,
                        isSocialMedia: imageInfo.sourceUrl ?
                            (imageInfo.sourceUrl.includes('facebook.com') || imageInfo.sourceUrl.includes('instagram.com')) : false
                    });
                    console.log(`[Google] ✓ 圖片 ${results.length}/${MAX_INITIAL}: ${imageInfo.imageUrl.slice(0, 50)}...`);
                    consecutiveErrors = 0;
                } else {
                    console.log(`[Google] #${i + 1}: 找不到高解析度圖片`);
                }

                processed++;

            } catch (e) {
                consecutiveErrors++;
                console.log(`[Google] #${i + 1}: 錯誤 - ${e.message.slice(0, 40)}`);
                // 如果連續錯誤太多，重新載入頁面
                if (consecutiveErrors > 5) {
                    console.log(`[Google] 連續錯誤過多，重新載入頁面`);
                    await page.reload({ waitUntil: 'networkidle2' });
                    await new Promise(r => setTimeout(r, 2000));
                    consecutiveErrors = 0;
                }
            }
        }

        console.log(`[Google] 完成: ${results.length} 張圖片 (處理 ${processed} 個)`);
        return results;

    } catch (e) {
        console.error(`[Google] 失敗: ${e.message}`);
        return [];
    } finally {
        await browser.close();
    }
}

// Web Scraper - 改進版：過濾總表、專注單場活動海報
async function fetchWebImages(source) {
    console.log(`[Web] Scraping: ${source.url}`);
    try {
        const html = await fetchHTMLWithPuppeteer(source.url);
        const $ = cheerio.load(html);
        const targetLinks = [];

        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');

            // 過濾條件：只要「捐血活動」相關連結
            if (text.includes('捐血活動') && !text.includes('暫停')) {
                // 排除總表/行事曆類連結
                if (text.includes('總表') || text.includes('行事曆') ||
                    text.includes('一覽') || text.includes('場次表') ||
                    text.includes('月行程')) {
                    console.log(`[Web] 跳過總表連結: ${text.slice(0, 30)}`);
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
            const detailHtml = await fetchHTMLWithPuppeteer(fullUrl);
            const $d = cheerio.load(detailHtml);

            // 檢查頁面是否為總表類（包含多個日期表格）
            const pageText = $d('body').text();
            const dateMatches = pageText.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g) || [];
            if (dateMatches.length > 5) {
                console.log(`[Web] 跳過總表頁 (${dateMatches.length} 個日期): ${fullUrl.slice(-30)}`);
                continue;
            }

            // 尋找海報圖片 - 優先找大圖
            const pageImages = [];
            $d('img').each((i, el) => {
                const src = $d(el).attr('src') || $d(el).attr('data-src');
                if (!src) return;

                // 過濾條件
                const url = src.startsWith('http') ? src : source.baseUrl + src;

                // 必須包含這些路徑之一（確保是上傳的圖片）
                if (!url.includes('file_pool') && !url.includes('upload') &&
                    !url.includes('xmimg') && !url.includes('storage')) return;

                // 排除太小的圖（如 icon）
                const width = $d(el).attr('width');
                const height = $d(el).attr('height');
                if ((width && parseInt(width) < 100) || (height && parseInt(height) < 100)) return;

                // 排除 logo、icon
                if (url.toLowerCase().includes('logo') || url.toLowerCase().includes('icon')) return;

                pageImages.push({ type: 'image', url, sourceUrl: fullUrl });
            });

            // 只取每頁的前 3 張大圖（避免太多）
            allImages = allImages.concat(pageImages.slice(0, 3));
        }

        // 去重並限制數量
        const dedupedImages = [...new Map(allImages.map(item => [item.url, item])).values()];
        console.log(`[Web] 收集 ${dedupedImages.length} 張圖片`);
        return dedupedImages.slice(0, 15);
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
    const today = new Date().toISOString().split('T')[0];

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
若海報符合以下任一情況，請直接回傳 null (與其給錯誤資訊，不如不要)：
1. **缺少日期** (日期必須明確)
2. **缺少地點** (地點必須明確)
3. **已過期** - 活動日期早於今日(${today})
4. **總表/行事曆類** - 請仔細辨識！若符合以下任一特徵，必須回傳 null：
   - 圖片呈現「表格形式」，有多個日期和地點排列
   - 包含超過 2 場活動資訊（2 個以上不同日期或地點）
   - 標題含有「活動一覽」、「行事曆」、「總表」、「月行程」、「場次表」等字樣
   - 呈現類似行事曆/月曆的排版格式
   **我只需要「單場活動」的海報，請拒絕所有多場活動列表！**
5. **例行性文字** - 若僅有「每週」或「每月」等例行性說明，無具體日期，回傳 null
6. **圖片品質差** - 若圖片尺寸極小或模糊無法辨識，回傳 null

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
    "title": "活動標題 (請包含地點與關鍵特色)",
    "date": "YYYY-MM-DD",
    "time": "HH:MM-HH:MM",
    "location": "地點名稱",
    "city": "縣市",
    "district": "行政區",
    "organizer": "主辦單位",
    "gift": { "name": "贈品名稱 (若無實質贈品填 null)", "image": null },
    "tags": ["AI辨識"]
  }
]
`;
            const result = await gen.generateContent([prompt, { inlineData: { data: base64, mimeType: "image/jpeg" } }]);
            const txt = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            if (txt === 'null') return null;

            return JSON.parse(txt);

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
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

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

        for (const item of items) {
            // Level 1 Dedupe: Exact URL match (skip processing entirely if we know we have it)
            // UNLESS we want to re-check if our current version is "bad"?
            // For now, assume if URL matches, we processed it fully before.
            if (existingUrlSet.has(item.url)) {
                console.log(`[Skip] Duplicate image URL: ${item.url.slice(0, 30)}...`);
                continue;
            }

            // AI Analyze
            await new Promise(r => setTimeout(r, 2000)); // Rate limit buffer
            try {
                const results = await analyzeContentWithAI(item, source);
                if (results) {
                    const validEvents = Array.isArray(results) ? results : [results];
                    for (const evt of validEvents) {
                        if (!evt || !evt.date || !evt.location) continue; // Strict check

                        // CRITICAL: Skip expired events (double check AI response)
                        if (evt.date < todayStr) {
                            console.log(`[Skip] Expired event: ${evt.date} ${evt.location}`);
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
                                console.log(`[Update] Found better version for ${evt.date} ${evt.location} (Score ${newEventScore} > ${existing._score})`);
                                isUpdate = true;
                                evt.id = existing.id; // CRITICAL: Preserve ID to update
                            } else {
                                console.log(`[Skip] Existing version better/equal for ${evt.date} ${evt.location} (Score ${existing._score} >= ${newEventScore})`);
                                shouldSkip = true;
                            }
                        }

                        if (shouldSkip) continue;

                        // New or Better Version Found - Upload Image
                        const storageUrl = await uploadImageToStorage(supabase, item.url);
                        if (!storageUrl) {
                            console.log(`[Skip] Image upload failed or too small.`);
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
