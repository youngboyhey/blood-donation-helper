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
    // 1. PTT Source (指定網頁)
    {
        name: "PTT Lifeismoney",
        type: "ptt",
        url: "https://www.pttweb.cc/bbs/Lifeismoney/M.1735838860.A.6F3"
    },
    // 2. 官網爬蟲 (官方源)
    {
        name: "台北捐血中心",
        type: "web",
        url: "https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284",
        baseUrl: "https://www.tp.blood.org.tw"
    },
    {
        name: "新竹捐血中心",
        type: "web",
        url: "https://www.sc.blood.org.tw/xmdoc?xsmsid=0P066666699492479492",
        baseUrl: "https://www.sc.blood.org.tw"
    }
];

// --- Helpers ---

// 從地點名稱中提取縣市
function extractCity(location) {
    if (!location) return null;
    const cities = [
        '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
        '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
        '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
        '台東縣', '澎湖縣', '金門縣', '連江縣'
    ];
    for (const city of cities) {
        if (location.includes(city)) return city;
    }
    // 嘗試模糊匹配（如 "台北" -> "台北市"）
    const fuzzyMap = {
        '台北': '台北市', '新北': '新北市', '桃園': '桃園市',
        '台中': '台中市', '台南': '台南市', '高雄': '高雄市',
        '基隆': '基隆市', '新竹': '新竹市', '嘉義': '嘉義市'
    };
    for (const [key, val] of Object.entries(fuzzyMap)) {
        if (location.includes(key)) return val;
    }
    return null;
}

// 有效的台灣 22 縣市清單
const VALID_CITIES = [
    '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
    '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
    '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
    '台東縣', '澎湖縣', '金門縣', '連江縣'
];

// 地標對應縣市 - 用於智慧修正
const LANDMARK_TO_CITY = {
    '藝文特區': '桃園市', '中壢': '桃園市', '八德': '桃園市', '平鎮': '桃園市',
    '楊梅': '桃園市', '龍潭': '桃園市', '大溪': '桃園市', '蘆竹': '桃園市',
    '信義區': '台北市', '大安區': '台北市', '中正區': '台北市', '松山區': '台北市',
    '內湖區': '台北市', '南港區': '台北市', '士林區': '台北市', '北投區': '台北市',
    '板橋': '新北市', '三重': '新北市', '新莊': '新北市', '中和': '新北市',
    '永和': '新北市', '土城': '新北市', '汐止': '新北市', '樹林': '新北市',
    '竹北': '新竹縣', '竹東': '新竹縣', '湖口': '新竹縣', '新豐': '新竹縣',
    '東區': '新竹市', '北區': '新竹市', '香山區': '新竹市', // 新竹市只有3區
    '豐原': '台中市', '大里': '台中市', '太平': '台中市', '沙鹿': '台中市',
    '清水': '台中市', '大甲': '台中市', '烏日': '台中市', '霧峰': '台中市',
    '鳳山': '高雄市', '左營': '高雄市', '前鎮': '高雄市', '三民': '高雄市',
    '楠梓': '高雄市', '岡山': '高雄市', '小港': '高雄市', '鼓山': '高雄市',
    '安平': '台南市', '永康': '台南市', '新營': '台南市', '仁德': '台南市',
    '頭份': '苗栗縣', '竹南': '苗栗縣', '苗栗市': '苗栗縣',
    '員林': '彰化縣', '彰化市': '彰化縣', '鹿港': '彰化縣',
    '斗六': '雲林縣', '虎尾': '雲林縣',
    '太保': '嘉義縣', '朴子': '嘉義縣', '民雄': '嘉義縣',
    '潮州': '屏東縣', '屏東市': '屏東縣', '東港': '屏東縣',
    '宜蘭市': '宜蘭縣', '羅東': '宜蘭縣',
    '花蓮市': '花蓮縣',
    '台東市': '台東縣'
};

// 驗證並修正 AI 回傳的縣市
function validateAndFixCity(aiCity, location, district, organizer) {
    // 1. 如果 AI 回傳的 city 已經是有效縣市，直接返回
    if (aiCity && VALID_CITIES.includes(aiCity)) {
        return aiCity;
    }

    // 2. 嘗試從 location/district/organizer 透過地標對應修正
    const allText = `${location || ''} ${district || ''} ${organizer || ''}`;

    for (const [landmark, city] of Object.entries(LANDMARK_TO_CITY)) {
        if (allText.includes(landmark)) {
            console.log(`[City Fix] 透過地標「${landmark}」修正為「${city}」`);
            return city;
        }
    }

    // 3. 嘗試模糊匹配（如 "新竹" -> "新竹市"）
    const fuzzyMap = {
        '台北': '台北市', '新北': '新北市', '桃園': '桃園市',
        '台中': '台中市', '台南': '台南市', '高雄': '高雄市',
        '基隆': '基隆市', '新竹': '新竹市', '嘉義': '嘉義市'
    };

    for (const [key, val] of Object.entries(fuzzyMap)) {
        if (aiCity && aiCity.includes(key)) {
            console.log(`[City Fix] 模糊匹配「${aiCity}」修正為「${val}」`);
            return val;
        }
    }

    // 4. 最後嘗試從 location 提取
    const extracted = extractCity(allText);
    if (extracted) {
        console.log(`[City Fix] 從文字中提取出「${extracted}」`);
        return extracted;
    }

    console.log(`[City Fix] 無法修正縣市「${aiCity}」`);
    return null;
}

// 從地點名稱中提取行政區
function extractDistrict(location) {
    if (!location) return null;
    const districtMatch = location.match(/([\u4e00-\u9fa5]{2,3}[區鄉鎮市])/);
    return districtMatch ? districtMatch[1] : null;
}

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

async function fetchPTTImages(source) {
    console.log(`[PTT] Scraping: ${source.url}`);
    const results = [];
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // 提取所有圖片連結
        const imageUrls = await page.evaluate(() => {
            const links = new Set();
            const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
            const validDomains = ['imgur.com', 'meee.com.tw', 'mopix.cc', 'ppt.cc'];

            // 1. 找所有 <a> 標籤的 href
            document.querySelectorAll('a').forEach(a => {
                const href = a.href;
                if (!href) return;

                const lowerHref = href.toLowerCase();
                const isImageExt = validExtensions.some(ext => lowerHref.endsWith(ext));
                const isImageDomain = validDomains.some(domain => lowerHref.includes(domain));

                if (isImageExt || isImageDomain) {
                    links.add(href);
                }
            });

            // 2. 找所有文字內容是否包含圖片網址 (PTT 網頁版有時候會顯示純文字連結)
            const textContent = document.body.innerText;
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = textContent.match(urlRegex) || [];
            matches.forEach(match => {
                const lowerMatch = match.toLowerCase();
                const isImageExt = validExtensions.some(ext => lowerMatch.endsWith(ext));
                const isImageDomain = validDomains.some(domain => lowerMatch.includes(domain));

                if (isImageExt || isImageDomain) {
                    // 清理可能黏在後面的標點符號
                    let cleanUrl = match;
                    if (cleanUrl.endsWith(')') || cleanUrl.endsWith(']')) cleanUrl = cleanUrl.slice(0, -1);
                    links.add(cleanUrl);
                }
            });

            return Array.from(links);
        });

        console.log(`[PTT] Found ${imageUrls.length} potential images`);

        for (const imgUrl of imageUrls) {
            // 轉換 Imgur 網頁連結為圖片直連 (雖然後端 AI 讀取通常沒問題，但轉成直連更保險)
            let directUrl = imgUrl;
            if (imgUrl.includes('imgur.com') && !imgUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                // 簡單嘗試加 .jpg，雖然不一定對，但對大多數 Imgur 分享有效
                // 或者依靠 fetchImageAsBase64 的強大相容性
                directUrl = imgUrl + '.jpg';
            }

            results.push({
                type: 'image',
                url: directUrl,
                sourceUrl: source.url,
                isSocialMedia: false,
                isHighRes: true
            });
        }

    } catch (e) {
        console.error(`[PTT] Error fetching ${source.url}:`, e);
    } finally {
        await browser.close();
    }

    // 套用數量限制 (測試用)
    const limit = source.limit || results.length;
    console.log(`[PTT] Returning ${Math.min(results.length, limit)} of ${results.length} images (limit: ${source.limit || 'none'})`);
    return results.slice(0, limit);
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


            const prompt = `
請分析這張圖片，判斷是否為「單一場次」的捐血活動海報。
今天是 ${today}。

【台灣縣市清單 - city 欄位只能填以下 22 個縣市之一】
台北市、新北市、桃園市、台中市、台南市、高雄市、
基隆市、新竹市、新竹縣、苗栗縣、彰化縣、南投縣、
雲林縣、嘉義市、嘉義縣、屏東縣、宜蘭縣、花蓮縣、
台東縣、澎湖縣、金門縣、連江縣

⚠️ 注意：
- 「新竹」不是有效縣市，必須明確填寫「新竹市」或「新竹縣」
- 「嘉義」不是有效縣市，必須明確填寫「嘉義市」或「嘉義縣」
- city 欄位必須是上述 22 個縣市之一，不可填寫其他值

【常見地標對應縣市 - 請依此判斷正確縣市】
- 藝文特區、中壢、八德、平鎮、楊梅、龍潭 → 桃園市
- 信義區、大安區、中正區、松山區、內湖區 → 台北市
- 板橋、三重、新莊、中和、永和、土城 → 新北市
- 竹北、竹東、湖口、新豐 → 新竹縣
- 東區、北區、香山區 → 新竹市
- 豐原、大里、太平、沙鹿、清水 → 台中市
- 鳳山、左營、前鎮、三民、楠梓、岡山 → 高雄市

【嚴格過濾規則 - 必須全部符合才算有效】

1. **總表/列表檢查 (最重要)**：
   - 若圖片是「活動總表」、「行事曆」、「場次表」、「巡迴表」，視為 **INVALID**。
   - 若圖片中包含 **多個不同地點** 或 **多個不同日期** 的活動列表，視為 **INVALID**。
   - 若圖片呈現表格形式，列出多個活動資訊，視為 **INVALID**。
   - **我只需要「單一場次」的活動海報，不要總表！**

2. **地點檢查 (重要！)**：
   - 必須有具體的活動地點名稱（如「XXX公園」、「XXX大樓」、「XXX路XX號」、「XXX捐血亭」）。
   - **至少要有縣市或行政區其中一個**。
   - ⚠️ **「XX捐血中心」是發布來源，不是活動地點！** 請忽略「新竹捐血中心」、「台北捐血中心」等字樣，從海報內容中找出實際活動地點。
   - 若僅有模糊地點（如「嘉義」、「南部」）而無具體地點，視為 **INVALID**。

3. **日期檢查 (重要！)**：
   - 必須有明確的單一日期，且為未來日期（晚於 ${today}）。
   - 若是日期區間（如 12/1~12/31），視為 **INVALID**。
   - ⚠️ **民國年轉換**：台灣常用民國紀年，如「114年12月13日」。
     - 民國年 + 1911 = 西元年
     - 114 + 1911 = **2025** (不是 2114 或 2125！)
     - 113 + 1911 = 2024
     - 請務必正確轉換後再填入 date 欄位

若不符合以上任一規則，請回傳：
{ "valid": false, "reason": "具體原因" }

【資訊提取】（僅在有效時填寫）
- **title**: 活動標題
- **date**: YYYY-MM-DD 格式 (西元年，如 2025-12-13)
- **time_start**: HH:mm
- **time_end**: HH:mm
- **location**: 具體地點名稱（如「藝文特區同德六街捐血亭」，不含縣市前綴）
- **city**: 必須是上述 22 縣市之一（如「桃園市」、「新竹市」）
- **district**: 行政區（如「八德區」、「中正區」、「竹北市」）
- **organizer**: 主辦單位
- **gift**: 贈品資訊。若有 250cc/500cc 差異請完整列出。

請以 JSON 格式回傳：
{
  "valid": true/false,
  "reason": "若無效則說明原因",
  "title": "活動標題",
  "date": "YYYY-MM-DD",
  "time_start": "HH:mm",
  "time_end": "HH:mm",
  "location": "地點名稱",
  "city": "縣市（必須是22縣市之一）",
  "district": "行政區",
  "organizer": "主辦單位",
  "gift": "贈品資訊"
}
`;
            const result = await gen.generateContent([prompt, { inlineData: { data: base64, mimeType: "image/jpeg" } }]);
            const text = result.response.text();

            // Clean markdown JSON
            const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            let data;
            try {
                data = JSON.parse(jsonText);
            } catch (e) {
                console.warn(`[AI] JSON Parse Fail: ${jsonText.slice(0, 50)}...`);
                return null;
            }

            // Check if AI marked as invalid
            if (data.valid === false) {
                console.log(`[AI Reject] ${data.reason || '無效活動'}`);
                return null;
            }

            // Also check legacy format
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
        let buffer;
        let contentType = 'image/jpeg';
        let ext = 'jpg';

        // 處理 base64 data URL
        if (imageUrl.startsWith('data:image/')) {
            console.log(`[Upload] 處理 base64 圖片...`);
            const match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!match) {
                console.log(`[Upload] 無效的 base64 格式`);
                return null;
            }
            ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            contentType = `image/${match[1]}`;
            const base64Data = match[2];
            buffer = Buffer.from(base64Data, 'base64');
        } else {
            // 處理 HTTP URL
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error('Download failed');
            buffer = Buffer.from(await response.arrayBuffer());
            contentType = response.headers.get('content-type') || 'image/jpeg';

            // 安全提取副檔名：只取最後一個 . 之後的部分，並過濾非法字元
            const urlPath = imageUrl.split('?')[0].split('#')[0]; // 移除 query 和 hash
            const lastDot = urlPath.lastIndexOf('.');
            if (lastDot > 0) {
                ext = urlPath.substring(lastDot + 1).toLowerCase();
                // 只保留合法的圖片副檔名
                if (!['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
                    ext = 'jpg';
                }
            }
        }

        // Strict Size Check (Double Check)
        if (buffer.byteLength < 5000) { // < 5KB is likely junk or tiny icon
            console.log(`[Upload] Skip tiny image (${buffer.byteLength} bytes)`);
            return null;
        }

        // 使用圖片內容的 hash 作為檔名（而非 URL），確保唯一性且無非法字元
        const contentHash = crypto.createHash('md5').update(buffer).digest('hex');
        const filename = `${contentHash}.${ext}`;

        console.log(`[Upload] 上傳檔案: ${filename}`);

        const { data, error } = await supabase.storage.from('posters').upload(filename, buffer, {
            contentType: contentType,
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
    // gift 可能是 string 或 object
    if (evt.gift) {
        if (typeof evt.gift === 'string' && evt.gift.length > 5) score += 2;
        else if (evt.gift.name) score += 2;
    }
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
    const existingUrlSet = new Set();        // 原始圖片 URL 去重
    const existingPosterUrlSet = new Set();  // poster_url（基於圖片內容 hash）去重 - 跨來源去重關鍵！

    if (existingEventsData) {
        for (const e of existingEventsData) {
            const key = generateEventKey(e);
            const score = calculateEventScore(e);

            // Keep the best one if DB already has dupes (unlikely but safe)
            if (!existingEventsMap.has(key) || score > existingEventsMap.get(key).score) {
                existingEventsMap.set(key, { ...e, _score: score });
            }
            if (e.original_image_url) existingUrlSet.add(e.original_image_url);
            if (e.poster_url) existingPosterUrlSet.add(e.poster_url);  // 加入 poster_url 去重
        }
    }
    console.log(`[Dedupe] Loaded ${existingEventsMap.size} unique future events, ${existingPosterUrlSet.size} unique poster URLs.`);

    const eventsToInsert = [];
    const eventsToUpdate = [];

    for (const source of SOURCES) {
        console.log(`\n=== Processing ${source.name} ===`);
        // Rate limit between sources
        if (source !== SOURCES[0]) await new Promise(r => setTimeout(r, 2000));

        let items = [];
        try {
            if (source.type === 'ptt') {
                items = await fetchPTTImages(source);
            } else {
                items = await fetchWebImages(source);
            }
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
                    // 驗證必要欄位：title, date, location 都必須存在且非空
                    if (!evt || !evt.title || !evt.date || !evt.location) {
                        const missing = [];
                        if (!evt?.title) missing.push('title');
                        if (!evt?.date) missing.push('date');
                        if (!evt?.location) missing.push('location');
                        console.log(`${imgLabel} Skip: 缺少必要欄位 [${missing.join(', ')}]`);
                        continue;
                    }

                    // 額外驗證 title 不能是空字串
                    if (evt.title.trim() === '') {
                        console.log(`${imgLabel} Skip: title 為空字串`);
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

                    // 跨來源圖片去重：檢查 poster_url 是否已存在（基於圖片內容 hash）
                    // 這可以捕捉到來自不同來源但內容相同的海報圖片
                    if (existingPosterUrlSet.has(storageUrl)) {
                        console.log(`${imgLabel} Skip: 相同圖片已存在（跨來源去重）`);
                        continue;
                    }

                    // Prepare Final Object
                    // Prepare Final Object

                    // 驗證並修正縣市（確保是有效的 22 縣市之一）
                    const validatedCity = validateAndFixCity(evt.city, evt.location, evt.district, evt.organizer);

                    if (!validatedCity) {
                        console.log(`${imgLabel} Skip: 無法辨識有效縣市 - ${evt.location}`);
                        continue;
                    }

                    const finalEvent = {
                        // ...evt, // 不要直接展開 evt，避免包含 address 等無效欄位
                        title: evt.title,
                        date: evt.date,
                        time: evt.time || `${evt.time_start}-${evt.time_end}`, // 相容舊欄位 time
                        location: evt.address ? `${evt.location} (${evt.address})` : evt.location, // 將地址合併到地點
                        city: validatedCity,
                        district: evt.district || extractDistrict(evt.location),
                        organizer: evt.organizer,
                        gift: evt.gift,

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
                    existingPosterUrlSet.add(storageUrl); // 跨來源去重：同一次執行中也要追蹤
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
