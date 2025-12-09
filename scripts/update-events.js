import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化 Gemini 客戶端 (Moved to local scope for rotation)
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 清理資料的輔助函式
function sanitizeData(data) {
    if (Array.isArray(data)) {
        return data.map(sanitizeData);
    }
    if (data && typeof data === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(data)) {
            cleaned[key] = sanitizeData(value);
        }
        return cleaned;
    }
    if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
            return null;
        }
        return trimmed;
    }
    return data;
}

const SOURCES = [
    {
        type: 'web',
        id: 'taipei',
        name: '台北捐血中心',
        url: 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284',
        baseUrl: 'https://www.tp.blood.org.tw',
        city: '台北市'
    },
    {
        type: 'web',
        id: 'hsinchu',
        name: '新竹捐血中心',
        url: 'https://www.sc.blood.org.tw/xmdoc?xsmsid=0P066666699492479492',
        baseUrl: 'https://www.sc.blood.org.tw',
        city: '新竹市'
    },
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
    // Social Media Sources (FB/IG)
    { type: 'google', id: 'social_taichung', name: '台中捐血 (社群)', query: 'site:facebook.com OR site:instagram.com 台中 捐血活動 海報', city: '台中市' },
    { type: 'google', id: 'social_tainan', name: '台南捐血 (社群)', query: 'site:facebook.com OR site:instagram.com 台南 捐血活動 海報', city: '台南市' },
    { type: 'google', id: 'social_kaohsiung', name: '高雄捐血 (社群)', query: 'site:facebook.com OR site:instagram.com 高雄 捐血活動 海報', city: '高雄市' }
];

async function fetchHTMLWithPuppeteer(url) {
    console.log(`[Puppeteer] Launching browser to fetch: ${url}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 設定真實的 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const content = await page.content();
        await browser.close();
        return content;
    } catch (error) {
        console.error(`[Puppeteer] 抓取失敗 ${url}:`, error);
        await browser.close();
        throw error;
    }
}

async function loadCookies() {
    // 1. Try to load from environment variable (for CI)
    if (process.env.COOKIES_JSON) {
        try {
            const cookies = JSON.parse(process.env.COOKIES_JSON);
            console.log(`[Cookies] Loaded ${cookies.length} cookies from environment variable.`);
            return cookies;
        } catch (e) {
            console.error('[Cookies] Failed to parse COOKIES_JSON env var:', e.message);
        }
    }

    // 2. Try to load from local file
    const cookiePath = path.join(__dirname, '../cookies.json');
    if (fs.existsSync(cookiePath)) {
        try {
            const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
            console.log(`[Cookies] Loaded ${cookies.length} cookies from local file.`);
            return cookies;
        } catch (e) {
            console.error('[Cookies] Failed to load cookies from file:', e.message);
        }
    } else {
        console.log('[Cookies] No cookies found (env or file). Skipping deep scraping.');
    }
    return [];
}

async function fetchSourcePage(url, browser, cookies) {
    if (!url || !url.startsWith('http')) return null;

    console.log(`[Source] Deep scraping: ${url}`);
    const page = await browser.newPage();

    try {
        if (cookies && cookies.length > 0) {
            await page.setCookie(...cookies);
        }
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Facebook specific: disable notifications to avoid popups blocking content
        const context = browser.defaultBrowserContext();
        await context.overridePermissions(url, ['notifications']);

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Try to extract og:image first (most reliable for social media)
        const ogImage = await page.evaluate(() => {
            const meta = document.querySelector('meta[property="og:image"]');
            return meta ? meta.content : null;
        });

        if (ogImage) {
            console.log(`[Source] Found og:image: ${ogImage.substring(0, 50)}...`);
            return ogImage;
        }

        // Fallback: Find largest image on page
        const largestImage = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            const candidates = images.filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.width > 300 && rect.height > 300 && img.src.startsWith('http');
            });

            if (candidates.length === 0) return null;

            candidates.sort((a, b) => {
                const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                return areaB - areaA;
            });

            return candidates[0].src;
        });

        if (largestImage) {
            console.log(`[Source] Found largest image: ${largestImage.substring(0, 50)}...`);
            return largestImage;
        }

    } catch (e) {
        console.error(`[Source] Error scraping ${url}:`, e.message);
    } finally {
        await page.close();
    }
    return null;
}

async function fetchGoogleImages(source) {
    console.log(`[Google] 正在搜尋圖片: ${source.query}`);

    // Load cookies for deep scraping
    const cookies = await loadCookies();

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbm=isch&tbs=qdr:w`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 等待搜尋結果載入
        try {
            await page.waitForSelector('div[data-id] img', { timeout: 10000 });
        } catch (e) {
            console.log(`[Google] 等待搜尋結果超時: ${source.name}`);
            return [];
        }

        const images = [];
        // 模擬人類行為：先捲動頁面以觸發 lazy loading
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight || totalHeight > 3000) { // 捲動一部分即可，不用到底
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });

        // 隨機等待一下
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        const MAX_RESULTS = 8; // Target unique results
        const MAX_ATTEMPTS = 30; // Safety limit to prevent infinite loops
        let attempts = 0;
        let uniqueCount = 0;
        const visitedDeepLinks = new Set(); // Track visited deep links to prevent duplicate scraping

        console.log(`[Google] 準備處理結果，目標獲取 ${MAX_RESULTS} 筆不重複的高畫質圖片...`);

        while (uniqueCount < MAX_RESULTS && attempts < MAX_ATTEMPTS) {
            try {
                // 每次重新查詢元素以避免 stale element
                const thumbnails = await page.$$('div[data-id] img');
                if (attempts >= thumbnails.length) break;

                const thumb = thumbnails[attempts];
                attempts++; // Increment attempts counter

                // 先提取縮圖 src 作為備案
                let thumbSrc = null;
                try {
                    thumbSrc = await page.evaluate(el => el.src, thumb);
                } catch (e) {
                    // console.log(`[Google] 無法預先提取縮圖: ${e.message}`);
                }

                // 點擊縮圖
                let clickSuccess = false;
                try {
                    // 隨機延遲點擊
                    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
                    await page.evaluate(el => el.click(), thumb);
                    clickSuccess = true;
                } catch (e) {
                    console.log(`[Google] 點擊縮圖失敗: ${e.message}，將使用縮圖作為備案`);
                }

                let result = { highResUrl: null, visitUrl: null };

                if (clickSuccess) {
                    // 等待側邊欄載入，並嘗試等待高畫質圖片 (非 gstatic)
                    try {
                        await page.waitForFunction(() => {
                            const imgs = Array.from(document.querySelectorAll('img'));
                            // 尋找寬度大於 300 且網址不是 gstatic 的圖片
                            return imgs.some(img => {
                                const rect = img.getBoundingClientRect();
                                return rect.width > 300 &&
                                    img.src.startsWith('http') &&
                                    !img.src.includes('gstatic.com') &&
                                    !img.src.includes('google.com');
                            });
                        }, { timeout: 8000 }).catch(() => { });
                    } catch (e) { }

                    // 額外等待一下
                    await new Promise(r => setTimeout(r, 1500));

                    // 提取資料 (高畫質圖 + 前往連結)
                    try {
                        result = await page.evaluate(() => {
                            // Helper to check if an image is likely an icon/logo
                            const isIcon = (img) => {
                                const src = img.src.toLowerCase();
                                return src.includes('icon') || src.includes('logo') || src.includes('favicon');
                            };

                            // Helper to check if image is a placeholder
                            const isPlaceholder = (img) => {
                                const src = img.src;
                                return src.includes('data:image/gif') || src.includes('R0lGODlhAQABA');
                            };

                            const images = Array.from(document.querySelectorAll('img'));
                            let bestImg = null;
                            let maxArea = 0;

                            images.forEach(img => {
                                const rect = img.getBoundingClientRect();
                                const area = rect.width * rect.height;

                                if (rect.width > 300 &&
                                    img.src.startsWith('http') &&
                                    !img.src.includes('gstatic.com') &&
                                    !img.src.includes('google.com') &&
                                    !isIcon(img) &&
                                    !isPlaceholder(img)) {

                                    if (area > maxArea) {
                                        maxArea = area;
                                        bestImg = img;
                                    }
                                }
                            });

                            let highResUrl = bestImg ? bestImg.src : null;

                            // 2. Find "Visit" link
                            const links = Array.from(document.querySelectorAll('a'));
                            let visitUrl = null;

                            // Strategy 1: Look for specific "Visit" button text/aria-label
                            const visitLink = links.find(a => {
                                const text = a.innerText.trim();
                                const ariaLabel = a.getAttribute('aria-label') || '';
                                const rect = a.getBoundingClientRect();

                                if (rect.width === 0 || rect.height === 0) return false;

                                return (text.includes('前往') || text.includes('Visit') || text === '網站' || text === 'Website') ||
                                    (ariaLabel.includes('前往') || ariaLabel.includes('Visit') || ariaLabel === '網站' || ariaLabel === 'Website');
                            });

                            if (visitLink) {
                                visitUrl = visitLink.href;
                            } else {
                                // Strategy 2: Look for the first external link in the right half of the screen
                                const sidePanelLinks = links.filter(a => {
                                    const rect = a.getBoundingClientRect();
                                    return rect.left > window.innerWidth / 2 && // Right half
                                        rect.width > 0 && rect.height > 0 &&
                                        a.href.startsWith('http') &&
                                        !a.href.includes('google.com') &&
                                        !a.href.includes('facebook.com/sharer');
                                });

                                if (sidePanelLinks.length > 0) {
                                    visitUrl = sidePanelLinks[0].href;
                                }
                            }

                            return { highResUrl, visitUrl };
                        });
                    } catch (e) {
                        // console.log(`[Google] 提取詳細資料失敗: ${e.message}`);
                    }
                }

                let finalImageUrl = result.highResUrl;

                // Deep scraping deduplication check
                if (result.visitUrl) {
                    if (visitedDeepLinks.has(result.visitUrl)) {
                        console.log(`[Google] 跳過重複的深入抓取連結: ${result.visitUrl}`);
                        // Skip deep scraping, but we might still use the highResUrl if available
                        // However, if the main value is the deep scrape, we might want to skip this result entirely?
                        // Let's skip deep scraping but keep the image if we have one.
                        // Actually, user wants to avoid "repeatedly parsing".
                        // If we skip deep scraping, we just use the Google image.
                    } else {
                        visitedDeepLinks.add(result.visitUrl);
                        const deepImage = await fetchSourcePage(result.visitUrl, browser, cookies);
                        if (deepImage) {
                            console.log(`[Google] 使用深入抓取的圖片取代: ${deepImage.substring(0, 50)}...`);
                            finalImageUrl = deepImage;
                        }
                    }
                }

                // Double check if highResUrl is a placeholder or too short (only for data URLs)
                if (finalImageUrl && finalImageUrl.startsWith('data:') && (finalImageUrl.includes('data:image/gif') || finalImageUrl.length < 100)) {
                    finalImageUrl = null;
                }

                finalImageUrl = finalImageUrl || thumbSrc;
                const finalSourceUrl = result.visitUrl || searchUrl;

                if (finalImageUrl && (finalImageUrl.startsWith('http') || finalImageUrl.length > 100)) {
                    // Check for duplicate image URLs in the current batch
                    const isDuplicateImage = images.some(img => img.url === finalImageUrl);
                    if (!isDuplicateImage) {
                        images.push({
                            type: 'image',
                            url: finalImageUrl,
                            sourceUrl: finalSourceUrl // 儲存真實來源連結
                        });
                        uniqueCount++;
                    }
                }

            } catch (err) {
                console.error(`[Google] 處理第 ${attempts} 筆圖片時發生錯誤:`, err.message);
            }
        }

        console.log(`[Google] 共收集 ${images.length} 張圖片 (嘗試了 ${attempts} 次)`);

        return images;

    } catch (error) {
        console.error(`[Google] 搜尋失敗 ${source.name}:`, error);
        return [];
    } finally {
        await browser.close();
    }
}

async function fetchWebImages(source) {
    console.log(`[Web] 正在抓取官網: ${source.name} (${source.url})`);
    try {
        const html = await fetchHTMLWithPuppeteer(source.url);
        const $ = cheerio.load(html);

        // 尋找包含 "假日捐血活動" 或 "捐血活動" 的連結
        const targetLinks = [];
        const links = $('a');

        // 輔助函式：從標題解析日期
        const parseDatesFromTitle = (title) => {
            const dateRegex = /(\d{1,2})[\/\.](\d{1,2})/g;
            const matches = [...title.matchAll(dateRegex)];
            if (matches.length === 0) return null;

            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1;

            // 找出標題中提到的所有日期
            const dates = matches.map(m => {
                let month = parseInt(m[1], 10);
                let day = parseInt(m[2], 10);

                // 簡單的年份判斷：如果現在是 12 月，但活動是 1 月，假設是明年
                let year = currentYear;
                if (currentMonth === 12 && month === 1) {
                    year = currentYear + 1;
                }
                // 如果現在是 1 月，但活動是 12 月，假設是去年 (已過期)
                else if (currentMonth === 1 && month === 12) {
                    year = currentYear - 1;
                }

                return new Date(year, month - 1, day);
            });

            // 回傳最晚的日期
            return new Date(Math.max(...dates));
        };

        links.each((i, el) => {
            const text = $(el).text().trim();
            // Relaxed search: Look for "捐血活動" but exclude "How to" or "Suspended" posts
            if (text.includes('捐血活動') &&
                !text.includes('怎麼辦') &&
                !text.includes('暫停') &&
                !text.includes('新聞稿')) {

                // 日期過濾邏輯
                const latestDate = parseDatesFromTitle(text);
                if (latestDate) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    if (latestDate < today) {
                        console.log(`[Web] 跳過過期活動: ${text} (日期: ${latestDate.toLocaleDateString()})`);
                        return; // continue loop
                    }
                }

                let href = $(el).attr('href');
                if (href) {
                    const fullUrl = href.startsWith('http') ? href : source.baseUrl + href;
                    targetLinks.push(fullUrl);
                }
            }
        });

        if (targetLinks.length === 0) {
            console.log(`[Web] 在 ${source.name} 找不到活動連結，跳過。`);
            return [];
        }

        // 去重連結 (有些網站可能有多個連結指向同一頁)
        const uniqueLinks = [...new Set(targetLinks)];
        console.log(`[Web] 找到 ${uniqueLinks.length} 個潛在活動頁面:`, uniqueLinks);

        let allImages = [];

        for (const fullUrl of uniqueLinks) {
            console.log(`[Web] 正在處理活動頁面: ${fullUrl}`);
            try {
                const detailHtml = await fetchHTMLWithPuppeteer(fullUrl);
                const $detail = cheerio.load(detailHtml);
                const pageImages = [];

                $detail('img').each((i, el) => {
                    const src = $detail(el).attr('src');
                    if (src && (src.includes('file_pool') || src.includes('upload'))) {
                        const imgUrl = src.startsWith('http') ? src : source.baseUrl + src;
                        const lowerUrl = imgUrl.toLowerCase();

                        // Enhanced filtering to exclude non-poster images
                        if (!lowerUrl.includes('icon') &&
                            !lowerUrl.includes('logo') &&
                            !lowerUrl.endsWith('.svg') &&
                            !lowerUrl.endsWith('.gif') &&
                            !lowerUrl.includes('qr') &&
                            !lowerUrl.includes('line') &&
                            !lowerUrl.includes('fb') &&
                            !lowerUrl.includes('ig')) {

                            pageImages.push(imgUrl);
                        }
                    }
                });

                // 如果找不到圖片，嘗試提取純文字內容 (針對新竹捐血中心等純文字公告)
                if (pageImages.length === 0) {
                    console.log(`[Web] 找不到圖片，嘗試提取文字內容...`);
                    // 移除 script, style 等干擾元素
                    $detail('script').remove();
                    $detail('style').remove();
                    $detail('nav').remove();
                    $detail('header').remove();
                    $detail('footer').remove();

                    // 提取主要內容區塊 (通常是 article 或 main，或直接 body)
                    const textContent = $detail('body').text().replace(/\s+/g, ' ').trim();

                    // 簡單判斷內容長度，避免提取到空頁面
                    if (textContent.length > 100) {
                        console.log(`[Web] 提取到文字內容 (${textContent.length} 字)`);
                        allImages.push({ type: 'text', content: textContent, url: fullUrl });
                    }
                } else {
                    console.log(`[Web] 在此頁面找到 ${pageImages.length} 張圖片`);
                    pageImages.forEach(url => {
                        allImages.push({ type: 'image', url, postUrl: fullUrl });
                    });
                }

            } catch (err) {
                console.error(`[Web] 處理頁面失敗 ${fullUrl}:`, err);
            }
        }

        console.log(`[Web] 總共收集到 ${allImages.length} 筆資料`);

        // 簡單去重 (針對 URL)
        const uniqueResult = [];
        const seen = new Set();

        for (const item of allImages) {
            const key = item.type === 'image' ? item.url : item.url; // 文字模式用頁面 URL 當 key
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResult.push(item);
            }
        }

        // RPD Optimization: Limit to max 10 images per web source
        return uniqueResult.slice(0, 10);

    } catch (error) {
        console.error(`[Web] 抓取失敗 ${source.name}:`, error);
        return [];
    }
}


async function fetchImageAsBase64(url) {
    try {
        // 如果是 Data URL，直接回傳內容 (去掉前綴)
        if (url.startsWith('data:image')) {
            return url.split(',')[1];
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`取得圖片失敗: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
        console.error(`[Fetch] 圖片下載失敗: ${url.substring(0, 50)}...`);
        return null;
    }
}
class QuotaExhaustedError extends Error {
    constructor(message) {
        super(message);
        this.name = "QuotaExhaustedError";
    }
}

async function analyzeContentWithAI(item, sourceContext) {
    const isImage = item.type === 'image';
    const contentPreview = isImage ? item.url.substring(0, 50) : item.content.substring(0, 50);
    console.log(`[AI] 正在分析${isImage ? '圖片' : '文字'} (${sourceContext.city}): ${contentPreview}...`);

    // API Key Rotation Logic
    let apiKeys = [];
    if (process.env.GEMINI_API_KEYS) {
        apiKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k);
    }

    // Fallback or merge with GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY) {
        const legacyKeys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(k => k);
        apiKeys = [...new Set([...apiKeys, ...legacyKeys])];
    }

    if (apiKeys.length === 0) {
        console.error("[AI] No valid API keys found!");
        return null;
    }

    // Model Rotation List (Ordered by preference/cost)
    const MODELS = [
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash"
    ];

    // Helper to get model with specific key and model index
    const getModel = (keyIndex, modelIndex) => {
        const key = apiKeys[keyIndex % apiKeys.length].trim();
        const modelName = MODELS[modelIndex % MODELS.length];
        const genAI = new GoogleGenerativeAI(key);
        return {
            model: genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            }),
            keyMasked: key.substring(0, 5) + '...',
            modelName: modelName
        };
    };

    let retryCount = 0;
    // Total attempts = Keys * Models * 2 (allow 2 full cycles)
    const maxRetries = apiKeys.length * MODELS.length * 2;

    while (retryCount < maxRetries) {
        try {
            // Strategy: Exhaust all keys on the first model, then move to the next model
            const currentModelIndex = Math.floor(retryCount / apiKeys.length) % MODELS.length;
            const currentKeyIndex = retryCount % apiKeys.length;

            const { model, keyMasked, modelName } = getModel(currentKeyIndex, currentModelIndex);

            // Only log if it's a retry or first attempt
            if (retryCount > 0) {
                console.log(`[AI] Retry ${retryCount}: Using Key ${keyMasked} with Model ${modelName}`);
            }


            let prompt = '';
            let parts = [];
            const today = new Date().toISOString().split('T')[0];

            if (isImage) {
                const base64Image = await fetchImageAsBase64(item.url);
                if (!base64Image) return null;

                prompt = `請分析這張捐血活動海報。
來源脈絡：這張海報來自「${sourceContext.name}」，搜尋時設定的地點為「${sourceContext.city}」。
今天是 ${today}，請特別留意活動日期。

嚴格區分與過濾規則：
1. **日期精確性 (關鍵)**：
   - **多日期處理**：若海報包含多個日期 (例如 "12/1, 12/8, 12/15" 或 "12月1、8、15日")，**務必** 為每一個日期產生一個獨立的 JSON 物件。**絕對不要** 只回傳第一個日期。
   - 必須包含明確的「年份」或「日期」。
   - 若海報上只有 "12/25" 且無年份，請根據今天 (${today}) 判斷：
     - 若 12/25 已過，假設是明年。
     - 若 12/25 還沒到，假設是今年。
   - 若海報是「每週五」、「每月1號」等週期性活動，請 **回傳 null** (本系統暫不支援週期性活動)。
   - 若海報是「113年」或「114年」請自動轉換為西元 2024 或 2025。

2. **地點精確性 (嚴格禁止幻覺)**：
   - **絕對禁止** 猜測或補完地址。只提取海報上 **明確可見** 的地點資訊。
   - 若海報只寫「愛國超市前」，就填「愛國超市前」，**不要** 自動補上「高雄市岡山區...」除非海報上真的有寫。
   - 若地點是 "全台各地", "各捐血室", "詳見官網" 等模糊地點，請 **回傳 null**。
   - 若海報是多個場次的列表 (例如 "1月場次表")，請 **回傳 null** (本系統只處理單一或少數特定場次)。

3. **內容相關性**：
   - 必須是「捐血活動」。
   - 若是「捐血榮譽榜」、「缺血公告」、「新聞稿」、「衛教資訊」，請 **回傳 null**。

請輸出 JSON 格式 (不要 Markdown code block)，包含以下欄位：
[
  {
    "title": "活動標題 (請包含地點與關鍵特色)",
    "date": "YYYY-MM-DD (每個日期獨立一個物件)",
    "time": "時間 (HH:MM-HH:MM)",
    "location": "地點 (請盡量完整，但**嚴禁**無中生有地址)",
    "city": "縣市 (請務必從地點判斷，例如：桃園市、苗栗縣、新北市。若無法判斷才填 ${sourceContext.city})",
    "district": "行政區 (請仔細從地址中提取，例如：中區、北區、西屯區。若無法判斷請填 null)",
    "organizer": "主辦單位 (預設: ${sourceContext.name})",
    "gift": {
      "name": "贈品名稱 (請列出實質贈品，**嚴格排除**『捐血』、『捐發票』、『集點』、『健康檢查』等非物質項目。若無實質贈品請填 null)",
      "image": null
    },
    "tags": ["AI辨識", "自動更新", "縣市名稱(請填入實際判斷的縣市)"]
  }
]
`;
                parts = [prompt, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }];
            } else {
                prompt = `請分析以下捐血活動資訊文字。
來源脈絡：來自「${sourceContext.name}」，地點「${sourceContext.city}」。
今天是 ${today}。

文字內容：
${item.content}

嚴格區分與過濾規則：
1. **日期精確性 (關鍵)**：
   - **多日期處理**：若內容包含多個日期 (例如 "12/1, 12/8, 12/15")，**務必** 為每一個日期產生一個獨立的 JSON 物件。**絕對不要** 只回傳第一個日期。
   - 必須包含明確的「年份」或「日期」。
   - 若只有 "12/25" 且無年份，請根據今天 (${today}) 判斷：
     - 若 12/25 已過，假設是明年。
     - 若 12/25 還沒到，假設是今年。
   - 若是「每週五」、「每月1號」等週期性活動，請 **回傳 null**。
   - 若是「113年」或「114年」請自動轉換為西元 2024 或 2025。

2. **地點精確性 (嚴格禁止幻覺)**：
   - **絕對禁止** 猜測或補完地址。只提取文字中 **明確提到** 的地點資訊。
   - 若文字只寫「愛國超市前」，就填「愛國超市前」，**不要** 自動補上地址。
   - 若地點是 "全台各地", "各捐血室", "詳見官網" 等模糊地點，請 **回傳 null**。
   - 若是多個場次的列表 (例如 "1月場次表")，請 **回傳 null**。

3. **內容相關性**：
   - 必須是「捐血活動」。
   - 若是「捐血榮譽榜」、「缺血公告」、「新聞稿」，請 **回傳 null**。

請輸出 JSON 格式 (不要 Markdown code block)，包含以下欄位：
[
  {
    "title": "活動標題 (請包含地點與關鍵特色)",
    "date": "YYYY-MM-DD (每個日期獨立一個物件)",
    "time": "時間 (HH:MM-HH:MM)",
    "location": "地點 (請盡量完整，但**嚴禁**無中生有地址)",
    "city": "縣市 (請務必從地點判斷，例如：桃園市、苗栗縣、新北市。若無法判斷才填 ${sourceContext.city})",
    "district": "行政區 (請仔細從地址中提取，例如：中區、北區、西屯區。若無法判斷請填 null)",
    "organizer": "主辦單位 (預設: ${sourceContext.name})",
    "gift": {
      "name": "贈品名稱 (請列出實質贈品，**嚴格排除**『捐血』、『捐發票』、『集點』、『健康檢查』等非物質項目。若無實質贈品請填 null)",
      "image": null
    },
    "tags": ["AI辨識", "自動更新", "縣市名稱(請填入實際判斷的縣市)"]
  }
]
`;
                parts = [prompt];
            }

            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.text();
            const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();

            if (jsonStr === 'null') return null;

            try {
                const parsed = JSON.parse(jsonStr);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                console.error("JSON 解析失敗:", text);
                return null;
            }

        } catch (error) {
            // Check for Rate Limit (429) or Quota Exceeded
            if (error.message.includes('429') || error.message.includes('Resource has been exhausted')) {
                console.warn(`[AI] Rate Limit hit. Switching...`);
                retryCount++;
                // Add a small delay before retrying with new key/model
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            console.error(`AI 分析失敗:`, error);
            return null;
        }
        break; // Success or non-retriable error (handled inside try/catch)
    }

    if (retryCount >= maxRetries) {
        console.error(`[AI] All API keys and Models exhausted after ${maxRetries} attempts.`);
        throw new QuotaExhaustedError("All API keys and Models exhausted.");
    }
    return null;
}

async function updateEvents() {
    const allNewEvents = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. 載入現有資料以建立快取
    // 1. 從 Supabase 載入現有資料以建立快取 (取代原本的 File System)
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    // 使用 Service Role Key 以獲取完整權限 (繞過 RLS)
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let existingEvents = [];
    const cachedEventsMap = new Map(); // Key: poster_url (DB) or posterUrl (Script), Value: eventData

    try {
        console.log('[Cache] 正在從 Supabase 讀取現有活動...');
        const { data, error } = await supabase.from('events').select('*');
        if (error) throw error;

        existingEvents = data || [];
        console.log(`[Cache] 載入 ${existingEvents.length} 筆現有活動資料`);

        existingEvents.forEach(event => {
            // DB column is poster_url, script uses posterUrl internally mostly
            const pUrl = event.poster_url || event.posterUrl;
            if (pUrl) {
                // Normalize keys for consistency in script
                cachedEventsMap.set(pUrl, { ...event, posterUrl: pUrl });
            }
        });
    } catch (e) {
        console.error("[Cache]讀取現有資料失敗:", e);
    }

    for (const source of SOURCES) {
        console.log(`\n=== 開始處理來源: ${source.name} ===`);
        let items = [];

        if (source.type === 'web') {
            items = await fetchWebImages(source);
        } else if (source.type === 'google') {
            items = await fetchGoogleImages(source);
        }

        console.log(`[${source.name}] 準備分析 ${items.length} 筆項目...`);

        try { // Prepare to catch loop-breaking error
            for (const item of items) {
                // 2. 檢查快取
                if (item.type === 'image' && cachedEventsMap.has(item.url)) {
                    const cachedEvent = cachedEventsMap.get(item.url);

                    // 檢查快取活動是否過期
                    if (cachedEvent.date) {
                        const eventDate = new Date(cachedEvent.date);
                        if (eventDate >= today) {
                            console.log(`[Cache] 命中快取，跳過 AI 分析: ${cachedEvent.title} (${cachedEvent.date})`);
                            allNewEvents.push(cachedEvent);
                            continue;
                        } else {
                            console.log(`[Cache] 快取資料已過期，忽略: ${cachedEvent.title}`);
                            continue;
                        }
                    }
                }

                // 3. 無快取，執行 AI 分析
                // Rate Limit Protection: 增加 4 秒延遲，確保不超過 15 RPM (60s/4s = 15)
                // 雖然 gemini-2.0-flash-lite 支援 30 RPM，但保留緩衝更安全
                await new Promise(resolve => setTimeout(resolve, 4000));

                try {
                    const eventDataList = await analyzeContentWithAI(item, source);

                    if (eventDataList && eventDataList.length > 0) {
                        // ... processing ...
                        // (Keep existing processing logic, just wrapping analyzeCall)
                        for (const eventData of eventDataList) {
                            // ... same content as original lines 882-949 ...
                            if (!eventData) continue;
                            const normalizeText = (text) => { if (!text) return text; return text.replace(/臺/g, '台'); };
                            eventData.city = normalizeText(eventData.city);
                            eventData.location = normalizeText(eventData.location);
                            if (eventData.date) {
                                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                                if (!dateRegex.test(eventData.date)) { console.log(`[跳過] 日期格式錯誤: ${eventData.title} (${eventData.date})`); continue; }
                                const eventDate = new Date(eventData.date);
                                if (isNaN(eventDate.getTime())) { console.log(`[跳過] 無效日期: ${eventData.title} (${eventData.date})`); continue; }
                                if (eventDate < today) { console.log(`[跳過] 過期活動: ${eventData.title} (${eventData.date})`); continue; }
                            } else { console.log(`[跳過] 缺少日期: ${eventData.title}`); continue; }
                            const genericKeywords = ['全台', '全國', '各校園', '各捐血點', '各地', '全省'];
                            if (eventData.location && genericKeywords.some(kw => eventData.location.includes(kw)) && eventData.location.length < 10) { console.log(`[跳過] 通用地點: ${eventData.title} (${eventData.location})`); continue; }
                            const listKeywords = ['一覽表', '場次表', '行程表'];
                            if (eventData.title && listKeywords.some(kw => eventData.title.includes(kw))) { console.log(`[跳過] 彙整類標題: ${eventData.title}`); continue; }
                            if (item.type === 'image') {
                                eventData.posterUrl = item.url;
                                if (eventData.gift) eventData.gift.image = item.url;
                            } else { console.log(`[跳過] 無圖片活動: ${eventData.title}`); continue; }
                            eventData.sourceUrl = item.postUrl || item.url || source.url || item.sourceUrl;
                            eventData.id = Date.now() + Math.random();
                            if (eventData.date && eventData.location) {
                                allNewEvents.push(eventData);
                                console.log(`[成功] 提取活動: ${eventData.title} (${eventData.location})`);
                            }
                        }
                    }
                } catch (error) {
                    if (error instanceof QuotaExhaustedError) {
                        console.error("\n[CRITICAL] 額度完全耗盡，停止所有爬蟲任務！！");
                        // Break out of item loop
                        throw error;
                    } else {
                        console.error("處理項目時發生未預期錯誤:", error);
                    }
                }
            }
        } catch (error) {
            if (error instanceof QuotaExhaustedError) {
                console.log("[Core] 偵測到額度耗盡，停止處理此來源並終止程式。");
                break; // Break out of SOURCES loop
            } else {
                throw error; // Rethrow other errors
            }
        }
    }

    // 進階去重邏輯
    console.log(`[去重] 開始處理 ${allNewEvents.length} 筆活動...`);
    const uniqueEvents = [];

    // 輔助函式：簡單標準化 (僅移除空白與標點，保留文字核心)
    const simpleNormalize = (str) => (str || '').replace(/[\s\-\_]/g, '').toLowerCase();

    // 輔助函式：提取地點關鍵字 (利用括號分割，提取可能的場地名稱)
    const getVenueTokens = (str) => {
        if (!str) return [];
        // Split by full-width or half-width parenthesis
        const rawParts = str.split(/[(\uff08)\uff09]/);
        // Normalize each part and filter out short/empty strings
        return rawParts.map(p => simpleNormalize(p)).filter(p => p.length > 2);
    };

    for (const evt of allNewEvents) {
        // 1. 嘗試在已加入的清單中找到重複活動
        const duplicateIndex = uniqueEvents.findIndex(existing => {
            // 必須是同一天
            if (existing.date !== evt.date) return false;

            // 必須是同一個縣市 (如果有資料)
            if (existing.city && evt.city && existing.city !== evt.city) return false;

            const nLoc1 = simpleNormalize(existing.location);
            const nLoc2 = simpleNormalize(evt.location);

            // 1. 直接包含檢查
            let isMatch = nLoc1.includes(nLoc2) || nLoc2.includes(nLoc1);

            // 2. 關鍵字重疊檢查 (針對 "地址(地點)" vs "地點" 的情況)
            if (!isMatch) {
                const tokens1 = getVenueTokens(existing.location);
                const tokens2 = getVenueTokens(evt.location);

                // 只要有任一關鍵字完全相同，且長度足夠，就視為重複
                // 例如: "嘉義縣中埔鄉... (中埔鄉公所)" vs "中埔鄉公所" -> "中埔鄉公所" 匹配
                isMatch = tokens1.some(t1 => tokens2.some(t2 => t1 === t2));
            }

            if (isMatch) {
                console.log(`[去重] 發現重複: "${existing.title}" vs "${evt.title}"`);
            }
            return isMatch;
        });

        if (duplicateIndex !== -1) {
            // 找到重複，進行智慧合併
            const existing = uniqueEvents[duplicateIndex];
            console.log(`[去重] 合併活動: "${existing.title}" vs "${evt.title}"`);

            // 合併邏輯：保留資訊較完整的部分
            const merged = { ...existing };

            // 1. 海報：優先保留有的
            merged.posterUrl = existing.posterUrl || evt.posterUrl;

            // 2. 標題：保留較長的 (通常較詳細)
            if ((evt.title || '').length > (existing.title || '').length) {
                merged.title = evt.title;
            }

            // 3. 地點：保留較長的
            if ((evt.location || '').length > (existing.location || '').length) {
                merged.location = evt.location;
                merged.city = evt.city || existing.city; // 跟隨地點更新縣市
                merged.district = evt.district || existing.district;
            }

            // 4. 時間：優先保留有的
            merged.time = existing.time || evt.time;

            // 5. 贈品：優先保留有內容且較長的
            const gift1 = (existing.gift && existing.gift.name) ? existing.gift.name : '';
            const gift2 = (evt.gift && evt.gift.name) ? evt.gift.name : '';
            if (gift2.length > gift1.length) {
                merged.gift = evt.gift;
            }

            // 6. 標籤：合併並去重
            const tags = new Set([...(existing.tags || []), ...(evt.tags || [])]);
            merged.tags = Array.from(tags);

            // 更新回陣列
            uniqueEvents[duplicateIndex] = merged;
        } else {
            uniqueEvents.push(evt);
        }
    }

    console.log(`[去重] 完成，剩餘 ${uniqueEvents.length} 筆活動 (原始 ${allNewEvents.length} 筆)`);

    // 最終清理資料
    // 最終清理資料
    const cleanedEvents = sanitizeData(uniqueEvents).map(e => ({
        ...e,
        // Map script keys to DB keys
        poster_url: e.posterUrl || e.poster_url,
        source_url: e.sourceUrl || e.source_url,
        // Ensure no undefined
        gift: e.gift || null,
        tags: e.tags || [],
        updated_at: new Date().toISOString()
    }));

    // fs.writeFileSync(outputPath, JSON.stringify(cleanedEvents, null, 2));
    // console.log(`\n總共成功更新 ${cleanedEvents.length} 筆活動資料！`);

    // Upsert to Supabase
    console.log(`[DB] 準備寫入 ${cleanedEvents.length} 筆資料到 Supabase...`);

    // Split into chunks to avoid request size limits
    const CHUNK_SIZE = 50;
    for (let i = 0; i < cleanedEvents.length; i += CHUNK_SIZE) {
        const chunk = cleanedEvents.slice(i, i + CHUNK_SIZE);
        // Clean keys that might not exist in DB (e.g. posterUrl duplicate) is fine, Supabase ignores extra? 
        // No, Supabase might complain about extra columns. Let's sanitize strictly if possible.
        // Actually, let's keep it simple. If we map poster_url, we can delete posterUrl.
        const dbReadyChunk = chunk.map(({ posterUrl, sourceUrl, ...rest }) => rest);

        const { error } = await supabase.from('events').upsert(dbReadyChunk, {
            onConflict: 'id', // If we don't have consistent IDs, this is tricky.
            // Script generates: eventData.id = Date.now() + Math.random(); for NEW events.
            // But for CACHED events, they already have an ID from DB (UUID).
            // Wait, cached events from DB have 'id' (UUID).
            // New events from logic have 'id' (number).
            // Supabase expects UUID for 'id'. 
            // If I send a number as ID, Supabase will fail if column is UUID.
            // SOLUTION: For NEW events, DO NOT send 'id'. Let Supabase generate it.
            // For CACHED events, Keep the UUID.
        });

        // Refined Logic for IDs:
        const finalChunk = chunk.map(e => {
            const { posterUrl, sourceUrl, ...rest } = e;
            // Check if ID is UUID (string and long) or generated number (number)
            if (typeof rest.id === 'number') {
                delete rest.id; // Let DB generate new UUID
            }
            return rest;
        });

        const { error: upsertError } = await supabase.from('events').upsert(finalChunk);

        if (upsertError) {
            console.error(`[DB] 寫入失敗 (Batch ${i}):`, upsertError.message);
        } else {
            console.log(`[DB] 成功寫入批次 ${i} - ${Math.min(i + CHUNK_SIZE, cleanedEvents.length)}`);
        }
    }
    console.log(`\n總共成功更新 ${cleanedEvents.length} 筆活動資料！`);
}

updateEvents();
