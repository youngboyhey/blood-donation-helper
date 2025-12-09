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
    { type: 'web', id: 'taipei', name: '台北捐血中心', url: 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284', baseUrl: 'https://www.tp.blood.org.tw', city: '台北市' },
    { type: 'web', id: 'hsinchu', name: '新竹捐血中心', url: 'https://www.sc.blood.org.tw/xmdoc?xsmsid=0P066666699492479492', baseUrl: 'https://www.sc.blood.org.tw', city: '新竹市' },
    { type: 'google', id: 'taichung', name: '台中捐血中心', query: '台中 捐血活動 贈品', city: '台中市' },
    { type: 'google', id: 'changhua', name: '彰化捐血站', query: '彰化 捐血活動 贈品', city: '彰化縣' },
    { type: 'google', id: 'nantou', name: '南投捐血室', query: '南投 捐血活動 贈品', city: '南投縣' },
    { type: 'google', id: 'yunlin', name: '雲林捐血站', query: '雲林 捐血活動 贈品', city: '雲林縣' },
    { type: 'google', id: 'tainan', name: '台南捐血中心', query: '台南 捐血活動 贈品', city: '台南市' },
    { type: 'google', id: 'chiayi', name: '嘉義捐血站', query: '嘉義 捐血活動 贈品', city: '嘉義市' },
    { type: 'google', id: 'kaohsiung', name: '高雄捐血中心', query: '高雄 捐血活動 贈品', city: '高雄市' },
    { type: 'google', id: 'pingtung', name: '屏東捐血站', query: '屏東 捐血活動 贈品', city: '屏東縣' },
    { type: 'google', id: 'taitung', name: '台東捐血站', query: '台東 捐血活動 贈品', city: '台東縣' },
    { type: 'google', id: 'penghu', name: '馬公捐血站', query: '澎湖 捐血活動 贈品', city: '澎湖縣' },
    { type: 'google', id: 'social_taichung', name: '台中捐血 (社群)', query: 'site:facebook.com OR site:instagram.com 台中 捐血活動 海報', city: '台中市' },
    { type: 'google', id: 'social_tainan', name: '台南捐血 (社群)', query: 'site:facebook.com OR site:instagram.com 台南 捐血活動 海報', city: '台南市' },
    { type: 'google', id: 'social_kaohsiung', name: '高雄捐血 (社群)', query: 'site:facebook.com OR site:instagram.com 高雄 捐血活動 海報', city: '高雄市' }
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

// Google Image Search
async function fetchGoogleImages(source) {
    console.log(`[Google] Searching: ${source.query}`);
    const cookies = await loadCookies();
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbm=isch&tbs=qdr:w`, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const timer = setInterval(() => {
                    window.scrollBy(0, 100);
                    totalHeight += 100;
                    if (totalHeight > 3000) { clearInterval(timer); resolve(); }
                }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        const MAX_RESULTS = 8;
        let images = [];
        let attempts = 0;
        const thumbnails = await page.$$('div[data-id] img');

        for (let i = 0; i < Math.min(thumbnails.length, 30); i++) {
            if (images.length >= MAX_RESULTS) break;

            try {
                // Click thumbnail
                await thumbnails[i].click();
                await new Promise(r => setTimeout(r, 1500));

                // Find High Res
                const result = await page.evaluate(() => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    // Strict Filter: > 300x300, no gstatic/google/icons
                    const candidates = imgs.filter(img => {
                        const rect = img.getBoundingClientRect();
                        return rect.width >= 300 && rect.height >= 300 &&
                            img.src.startsWith('http') &&
                            !img.src.includes('gstatic') &&
                            !img.src.includes('google.com') &&
                            !img.src.includes('favicon');
                    });

                    if (candidates.length === 0) return null;
                    // Sort by area
                    candidates.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));

                    // Try to find Visit Link
                    const links = Array.from(document.querySelectorAll('a'));
                    const visit = links.find(a => (a.innerText.includes('前往') || a.innerText.includes('Visit')));

                    return { src: candidates[0].src, visit: visit ? visit.href : null };
                });

                if (result && result.src) {
                    // Check Dupes in batch
                    if (!images.some(img => img.url === result.src)) {
                        images.push({ type: 'image', url: result.src, sourceUrl: result.visit });
                    }
                }
            } catch (e) { }
        }
        return images;
    } catch (e) {
        console.error(`[Google] Failed: ${e.message}`);
        return [];
    } finally {
        await browser.close();
    }
}

// Web Scraper
async function fetchWebImages(source) {
    console.log(`[Web] Scraping: ${source.url}`);
    try {
        const html = await fetchHTMLWithPuppeteer(source.url);
        const $ = cheerio.load(html);
        const targetLinks = [];
        $('a').each((i, el) => {
            const text = $(el).text();
            if (text.includes('捐血活動') && !text.includes('暫停')) {
                let href = $(el).attr('href');
                if (href) targetLinks.push(href.startsWith('http') ? href : source.baseUrl + href);
            }
        });

        const uniqueLinks = [...new Set(targetLinks)].slice(0, 5); // Limit 5 pages
        let allImages = [];

        for (const fullUrl of uniqueLinks) {
            console.log(`[Web] Visiting: ${fullUrl}`);
            const detailHtml = await fetchHTMLWithPuppeteer(fullUrl);
            const $d = cheerio.load(detailHtml);

            $d('img').each((i, el) => {
                const src = $d(el).attr('src');
                if (src && (src.includes('file_pool') || src.includes('upload'))) {
                    // Check extension
                    if (!src.match(/\.(svg|gif|png|jpg|jpeg)$/i)) return;
                    const url = src.startsWith('http') ? src : source.baseUrl + src;
                    allImages.push({ type: 'image', url, sourceUrl: fullUrl });
                }
            });
        }
        return [...new Map(allImages.map(item => [item.url, item])).values()].slice(0, 10);
    } catch (e) {
        return [];
    }
}

// --- AI Logic ---
class QuotaExhaustedError extends Error { constructor(m) { super(m); this.name = "QuotaExhaustedError"; } }

async function fetchImageAsBase64(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        return Buffer.from(buf).toString('base64');
    } catch (e) { return null; }
}

async function analyzeContentWithAI(item, sourceContext) {
    const today = new Date().toISOString().split('T')[0];

    // API Key Rotation
    const keys = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").split(',').map(k => k.trim()).filter(k => k);
    if (!keys.length) return null;

    const MODELS = ["gemini-2.5-flash-lite", "gemini-2.0-flash"]; // No 1.5

    const getModel = (retry) => {
        const k = keys[retry % keys.length];
        const m = MODELS[Math.floor(retry / keys.length) % MODELS.length];

        // Safety: If keys are exhausted for all models? 
        // Logic: 2 models * N keys. 
        return {
            gen: new GoogleGenerativeAI(k).getGenerativeModel({ model: m, generationConfig: { responseMimeType: "application/json" } }),
            desc: `${m} w/ Key...${k.slice(-4)}`
        };
    };

    let retries = 0;
    const maxRetries = keys.length * MODELS.length * 2;

    while (retries < maxRetries) {
        let desc = `Retry ${retries}`;
        try {
            const modelInfo = getModel(retries);
            const gen = modelInfo.gen;
            desc = modelInfo.desc;

            if (retries > 0) console.log(`[AI Retry] ${desc}`);

            const base64 = await fetchImageAsBase64(item.url);
            if (!base64) return null; // Image load failed

            const prompt = `請分析這張捐血活動海報。
今天是 ${today}。

【嚴格過濾規則 - 重要】
若海報缺少以下任一關鍵資訊，請直接回傳 null (與其給錯誤資訊，不如不要)：
1. **日期** (必須明確)
2. **地點** (必須明確)
**修正規則**：
- 必須要有「日期」與「地點」。
- 若無年份，依今日(${today})推算。
- 若已過期，請回傳 null。
- 若圖片尺寸極小或模糊無法辨識，回傳 null。
- 若是「每週」或「每月」例行性文字，回傳 null。

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

            if (isRateLimit) {
                console.warn(`[AI] Rate Limit hit (${desc}). Switching...`);
                retries++;
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.warn(`[AI] Analysis Error (${desc}): ${e.message}`);
                // Try next model/key anyway for robustness? Or skip?
                // Typically parsing errors or blocked content won't be fixed by changing keys, but maybe models.
                // Let's retry just in case.
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

async function updateEvents() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // 1. Auto-Delete Expired Events
    console.log(`[Cleanup] Deleting events before ${todayStr}...`);
    const { error: delErr } = await supabase.from('events').delete().lt('date', todayStr);
    if (delErr) console.error(`[Cleanup] Failed: ${delErr.message}`);
    else console.log(`[Cleanup] Expired events cleared.`);

    // 2. Load Existing Hashes (Original URL) to Dedupe
    const { data: existing } = await supabase.from('events').select('original_image_url');
    const existingUrls = new Set((existing || []).map(e => e.original_image_url).filter(Boolean));
    console.log(`[Dedupe] Loaded ${existingUrls.size} existing image URLs.`);

    const allNewEvents = [];

    for (const source of SOURCES) {
        console.log(`\n=== Processing ${source.name} ===`);
        let items = source.type === 'web' ? await fetchWebImages(source) : await fetchGoogleImages(source);

        for (const item of items) {
            // Dedupe check
            if (existingUrls.has(item.url)) {
                console.log(`[Skip] Duplicate image: ${item.url.slice(0, 30)}...`);
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

                        // Valid Event Found! Now Download & Upload
                        const storageUrl = await uploadImageToStorage(supabase, item.url);
                        if (!storageUrl) {
                            console.log(`[Skip] Image upload failed or too small.`);
                            continue;
                        }

                        // Sanitize & Prepare
                        const newEvent = {
                            ...evt,
                            poster_url: storageUrl,
                            original_image_url: item.url, // Save for future dedupe
                            source_url: evt.sourceUrl || item.sourceUrl,
                            tags: evt.tags || [],
                            created_at: new Date(),
                            updated_at: new Date()
                        };

                        // Fix City/District if necessary (AI usually does well with new prompt, but safety check)
                        if (newEvent.city && newEvent.city.includes('市') && !newEvent.city.includes('縣') && !['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市', '基隆市', '新竹市', '嘉義市'].includes(newEvent.city)) {
                            // E.g. "南投市" -> City="南投縣", District="南投市"
                            // A bit complex to map all, relying on AI prompt primarily.
                        }

                        allNewEvents.push(newEvent);
                        console.log(`[New] ${evt.date} ${evt.title} (${evt.city})`);
                        existingUrls.add(item.url); // Add to local set to avoid re-adding in same run
                    }
                }
            } catch (e) {
                if (e.name === 'QuotaExhaustedError') throw e;
                console.error(`[Error] Processing item: ${e.message}`);
            }
        }
    }

    // Upsert to DB
    if (allNewEvents.length > 0) {
        console.log(`[DB] Upserting ${allNewEvents.length} new events...`);
        // Batch
        for (let i = 0; i < allNewEvents.length; i += 50) {
            const { error } = await supabase.from('events').insert(allNewEvents.slice(i, i + 50));
            if (error) console.error(`[DB] Insert failed: ${error.message}`);
        }
    } else {
        console.log(`[DB] No new events found.`);
    }
}

updateEvents().catch(console.error);
