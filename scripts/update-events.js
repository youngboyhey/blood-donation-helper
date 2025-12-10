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
        // Add recent filter (qdr:m = past month for more results)
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbm=isch&tbs=qdr:m`, { waitUntil: 'networkidle2', timeout: 60000 });

        // Scroll to load more images
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const timer = setInterval(() => {
                    window.scrollBy(0, 200);
                    totalHeight += 200;
                    if (totalHeight > 4000) { clearInterval(timer); resolve(); }
                }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 3000));

        const MAX_RESULTS = 8;
        let images = [];

        // Try multiple selectors (Google changes structure often)
        const selectorPatterns = [
            'div[data-id] img',
            'div[jsname] img.rg_i',
            'img.rg_i',
            'div.isv-r img',
            'a[jsname] img'
        ];

        let thumbnails = [];
        for (const selector of selectorPatterns) {
            thumbnails = await page.$$(selector);
            if (thumbnails.length > 0) {
                console.log(`[Google] Found ${thumbnails.length} thumbnails with selector: ${selector}`);
                break;
            }
        }

        if (thumbnails.length === 0) {
            console.warn(`[Google] No thumbnails found for: ${source.query}`);
            // Take screenshot for debugging
            // await page.screenshot({ path: `debug_${source.id}.png` });
            return [];
        }

        for (let i = 0; i < Math.min(thumbnails.length, 30); i++) {
            if (images.length >= MAX_RESULTS) break;

            try {
                // Click thumbnail
                await thumbnails[i].click();
                await new Promise(r => setTimeout(r, 2000));

                // Find High Res image
                const result = await page.evaluate(() => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    // Strict Filter: >= 300x300, no gstatic/google/icons
                    const candidates = imgs.filter(img => {
                        const rect = img.getBoundingClientRect();
                        const src = img.src || '';
                        return rect.width >= 300 && rect.height >= 300 &&
                            src.startsWith('http') &&
                            !src.includes('gstatic') &&
                            !src.includes('google.com') &&
                            !src.includes('favicon') &&
                            !src.includes('logo');
                    });

                    if (candidates.length === 0) return null;
                    // Sort by area
                    candidates.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));

                    // Try to find Visit Link
                    const links = Array.from(document.querySelectorAll('a'));
                    const visit = links.find(a => (a.innerText.includes('前往') || a.innerText.includes('Visit') || a.innerText.includes('造訪')));

                    return { src: candidates[0].src, visit: visit ? visit.href : null };
                });

                if (result && result.src) {
                    // Check Dupes in batch
                    if (!images.some(img => img.url === result.src)) {
                        images.push({ type: 'image', url: result.src, sourceUrl: result.visit });
                        console.log(`[Google] ✓ Found image ${images.length}/${MAX_RESULTS}`);
                    }
                }
            } catch (e) { }
        }

        console.log(`[Google] Collected ${images.length} images for ${source.query}`);
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

            const base64 = await fetchImageAsBase64(item.url);
            if (!base64) return null; // Image load failed

            const prompt = `請分析這張捐血活動海報。
今天是 ${today}。

【嚴格過濾規則 - 重要】
若海報符合以下任一情況，請直接回傳 null (與其給錯誤資訊，不如不要)：
1. **缺少日期** (日期必須明確)
2. **缺少地點** (地點必須明確)
3. **已過期** - 活動日期早於今日(${today})
4. **總表類海報** - 若海報包含「多場活動列表」、「總表」、「月行程表」等多筆活動資訊，請回傳 null（僅處理單場活動海報）
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
