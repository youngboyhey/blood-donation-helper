import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化 Gemini 客戶端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    { type: 'google', id: 'penghu', name: '馬公捐血站', query: '澎湖 捐血活動 贈品', city: '澎湖縣' }
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
    await page.setViewport({ width: 1280, height: 800 });
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

        const MAX_RESULTS = 10; // 限制搜尋數量至 10

        console.log(`[Google] 準備處理前 ${MAX_RESULTS} 筆結果以獲取高畫質圖片與來源連結...`);

        for (let i = 0; i < MAX_RESULTS; i++) {
            try {
                // 每次重新查詢元素以避免 stale element
                const thumbnails = await page.$$('div[data-id] img');
                if (i >= thumbnails.length) break;

                const thumb = thumbnails[i];

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
                            const images = Array.from(document.querySelectorAll('img'));
                            // 尋找寬度大於 300 且網址不是 gstatic 的圖片
                            return images.some(img => {
                                const rect = img.getBoundingClientRect();
                                return rect.width > 300 &&
                                    img.src.startsWith('http') &&
                                    !img.src.includes('gstatic.com') &&
                                    !img.src.includes('google.com');
                            });
                        }, { timeout: 5000 }).catch(() => { });
                    } catch (e) { }

                    // 額外等待一下
                    await new Promise(r => setTimeout(r, 1000));

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

                            const allImages = Array.from(document.querySelectorAll('img'));

                            const candidates = allImages.filter(img => {
                                const rect = img.getBoundingClientRect();
                                // Filter out small images (icons) and hidden images
                                if (rect.width < 300 || rect.height < 300) return false;
                                if (rect.width === 0 || rect.height === 0) return false;

                                // Filter out known icon patterns
                                if (isIcon(img)) return false;
                                if (isPlaceholder(img)) return false;

                                return true;
                            });

                            // Sort by size (largest first)
                            candidates.sort((a, b) => {
                                const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                                const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                                return areaB - areaA;
                            });

                            let highResUrl = null;
                            // Prefer the first candidate that starts with http AND is not gstatic
                            const httpCandidate = candidates.find(img => img.src.startsWith('http') && !img.src.includes('gstatic.com') && !img.src.includes('google.com'));

                            if (httpCandidate) {
                                highResUrl = httpCandidate.src;
                            } else if (candidates.length > 0) {
                                // Fallback: If no non-gstatic image found, try to find the largest one that isn't the thumbnail we clicked
                                // But if it's gstatic, it's likely just the preview.
                                // We'll take it if we have nothing else, but prefer httpCandidate.
                                highResUrl = candidates[0].src;
                            }

                            // 2. Find "Visit" link
                            const links = Array.from(document.querySelectorAll('a'));
                            let visitUrl = null;

                            // Strategy 1: Look for specific "Visit" button text/aria-label
                            // Google often uses aria-label="Visit" or "Website"
                            const visitLink = links.find(a => {
                                const text = a.innerText.trim();
                                const ariaLabel = a.getAttribute('aria-label') || '';
                                const rect = a.getBoundingClientRect();

                                // Must be visible
                                if (rect.width === 0 || rect.height === 0) return false;

                                return (text.includes('前往') || text.includes('Visit') || text === '網站' || text === 'Website') ||
                                    (ariaLabel.includes('前往') || ariaLabel.includes('Visit') || ariaLabel === '網站' || ariaLabel === 'Website');
                            });

                            if (visitLink) {
                                visitUrl = visitLink.href;
                            } else {
                                // Strategy 2: Look for the first external link in the right half of the screen
                                // This is the most reliable fallback for the "Visit" button which is usually near the title/image
                                const sidePanelLinks = links.filter(a => {
                                    const rect = a.getBoundingClientRect();
                                    return rect.left > window.innerWidth / 2 && // Right half
                                        rect.width > 0 && rect.height > 0 &&
                                        a.href.startsWith('http') &&
                                        !a.href.includes('google.com') &&
                                        !a.href.includes('facebook.com/sharer'); // Exclude share buttons
                                });

                                if (sidePanelLinks.length > 0) {
                                    // Usually the first one is the title link or the visit button
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

                // Deep scraping: If we have a visitUrl, try to get a better image from the source
                if (result.visitUrl) {
                    const deepImage = await fetchSourcePage(result.visitUrl, browser, cookies);
                    if (deepImage) {
                        console.log(`[Google] 使用深入抓取的圖片取代: ${deepImage.substring(0, 50)}...`);
                        finalImageUrl = deepImage;
                    }
                }

                // Double check if highResUrl is a placeholder or too short (only for data URLs)
                if (finalImageUrl && finalImageUrl.startsWith('data:') && (finalImageUrl.includes('data:image/gif') || finalImageUrl.length < 100)) {
                    // console.log(`[Google] High res URL looks like a placeholder, falling back to thumbnail.`);
                    finalImageUrl = null;
                }

                finalImageUrl = finalImageUrl || thumbSrc;
                const finalSourceUrl = result.visitUrl || searchUrl;

                if (finalImageUrl && (finalImageUrl.startsWith('http') || finalImageUrl.length > 100)) {
                    images.push({
                        type: 'image',
                        url: finalImageUrl,
                        sourceUrl: finalSourceUrl // 儲存真實來源連結
                    });
                }

            } catch (err) {
                console.error(`[Google] 處理第 ${i + 1} 筆圖片時發生錯誤:`, err.message);
            }
        }

        console.log(`[Google] 共收集 ${images.length} 張圖片`);

        // 去重
        const uniqueImages = [];
        const seenUrls = new Set();
        for (const img of images) {
            if (!seenUrls.has(img.url)) {
                seenUrls.add(img.url);
                uniqueImages.push(img);
            }
        }

        return uniqueImages;

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

        return uniqueResult;

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

async function analyzeContentWithAI(item, sourceContext) {
    const isImage = item.type === 'image';
    const contentPreview = isImage ? item.url.substring(0, 50) : item.content.substring(0, 50);
    console.log(`[AI] 正在分析${isImage ? '圖片' : '文字'} (${sourceContext.city}): ${contentPreview}...`);

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

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
1. **日期精確性**：
   - **絕對禁止猜測日期**。如果海報上沒有寫明確的日期（例如只寫「每週五」但沒寫具體幾號），或者日期模糊不清，請回傳 null。
   - **民國年轉換**：請正確將民國年（如 114年）轉換為西元年（2025年）。注意 113年是 2024年。
   - **過期檢查**：如果是「過期活動」(日期在 ${today} 之前)，請回傳 null。
   - **未來檢查**：如果海報上的日期是 ${today} 或之後的日期，才視為有效。

2. **地點具體性**：
   - **排除通用宣傳**：如果地點是「全台」、「各校園」、「全國」、「各捐血點」等模糊字眼，且**沒有**列出具體地址或特定捐血室名稱，請回傳 null。
   - **排除行政公告**：如果內容是「施工公告」、「暫停服務」、「遷移公告」、「會議通知」，回傳 null。

3. **跨縣市處理**：
   - 雖然搜尋來源是 ${sourceContext.city}，但若海報內容明確指出活動是在其他縣市（例如台南、高雄等），**請務必提取海報上的真實地點與縣市**。

請以 JSON 格式回傳以下欄位 (若無資料或不符合上述規則請填 null):
{
  "title": "活動標題",
  "date": "日期 (YYYY-MM-DD)",
  "time": "時間 (HH:MM-HH:MM)",
  "location": "地點 (請盡量完整，若海報只寫地標，請結合來源城市推斷完整地址)",
  "city": "縣市 (請務必從地點判斷，例如：桃園市、苗栗縣、新北市。若無法判斷才填 ${sourceContext.city})",
  "district": "行政區 (請仔細從地址中提取，例如：中區、北區、西屯區。若無法判斷請填 null)",
  "organizer": "主辦單位 (預設: ${sourceContext.name})",
  "gift": {
    "name": "贈品名稱 (請列出實質贈品，**嚴格排除**『捐血』、『捐發票』、『集點』、『健康檢查』等非物質項目。若無實質贈品請填 null)",
    "image": "圖片URL (程式會自動填入)"
  },
  "tags": ["AI辨識", "自動更新", "縣市名稱(請填入實際判斷的縣市)"]
}
`;
            parts = [prompt, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }];
        } else {
            // 文字分析模式
            prompt = `請分析以下捐血活動公告文字。
來源脈絡：來自「${sourceContext.name}」，搜尋時設定的地點為「${sourceContext.city}」。
今天是 ${today}，請特別留意活動日期。

請從文字中提取「單一」或「多個」捐血活動資訊。
嚴格過濾規則：
1. **日期**：只提取日期在「今天或未來」的活動。**絕對禁止猜測日期**。
2. **地點**：必須有具體地點。排除「全台」、「各捐血點」等模糊描述。
3. **排除**：施工、暫停、遷移、會議等行政公告。

文字內容：
${item.content}

請以 JSON 陣列格式回傳每個活動的以下欄位 (若無資料請填 null):
[
  {
    "title": "活動標題 (若無特定標題，可用 '捐血活動' + 日期)",
    "date": "日期 (YYYY-MM-DD)",
    "time": "時間 (HH:MM-HH:MM)",
    "location": "地點 (請盡量完整)",
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
        console.error(`AI 分析失敗:`, error);
        return null;
    }
}

async function updateEvents() {
    const allNewEvents = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. 載入現有資料以建立快取
    const outputPath = path.join(__dirname, '../src/data/events.json');
    let existingEvents = [];
    const cachedEventsMap = new Map(); // Key: posterUrl, Value: eventData

    if (fs.existsSync(outputPath)) {
        try {
            const rawData = fs.readFileSync(outputPath, 'utf-8');
            existingEvents = JSON.parse(rawData);
            console.log(`[Cache] 載入 ${existingEvents.length} 筆現有活動資料`);

            existingEvents.forEach(event => {
                if (event.posterUrl) {
                    cachedEventsMap.set(event.posterUrl, event);
                }
            });
        } catch (e) {
            console.error("[Cache] 讀取現有資料失敗:", e);
        }
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

            const eventDataList = await analyzeContentWithAI(item, source);

            if (eventDataList && eventDataList.length > 0) {
                for (const eventData of eventDataList) {
                    if (!eventData) continue;

                    // 輔助函式：正規化文字 (將 "臺" 轉為 "台")
                    const normalizeText = (text) => {
                        if (!text) return text;
                        return text.replace(/臺/g, '台');
                    };

                    eventData.city = normalizeText(eventData.city);
                    eventData.location = normalizeText(eventData.location);

                    // 日期過濾：只保留今天以後的活動，且格式必須正確
                    if (eventData.date) {
                        // 驗證日期格式 YYYY-MM-DD
                        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                        if (!dateRegex.test(eventData.date)) {
                            console.log(`[跳過] 日期格式錯誤: ${eventData.title} (${eventData.date})`);
                            continue;
                        }

                        const eventDate = new Date(eventData.date);
                        if (isNaN(eventDate.getTime())) {
                            console.log(`[跳過] 無效日期: ${eventData.title} (${eventData.date})`);
                            continue;
                        }

                        if (eventDate < today) {
                            console.log(`[跳過] 過期活動: ${eventData.title} (${eventData.date})`);
                            continue;
                        }
                    } else {
                        console.log(`[跳過] 缺少日期: ${eventData.title}`);
                        continue;
                    }

                    // 地點過濾：排除模糊地點
                    const genericKeywords = ['全台', '全國', '各校園', '各捐血點', '各地', '全省'];
                    if (eventData.location && genericKeywords.some(kw => eventData.location.includes(kw)) && eventData.location.length < 10) {
                        console.log(`[跳過] 通用地點: ${eventData.title} (${eventData.location})`);
                        continue;
                    }

                    if (item.type === 'image') {
                        eventData.posterUrl = item.url;
                        if (eventData.gift) {
                            eventData.gift.image = item.url;
                        }
                    }
                    eventData.sourceUrl = item.postUrl || item.url || source.url || item.sourceUrl;
                    eventData.id = Date.now() + Math.random();

                    if (eventData.date && eventData.location) {
                        allNewEvents.push(eventData);
                        console.log(`[成功] 提取活動: ${eventData.title} (${eventData.location})`);
                    }
                }
            }
        }
    }

    // 進階去重邏輯
    console.log(`[去重] 開始處理 ${allNewEvents.length} 筆活動...`);
    const uniqueEvents = [];

    // 輔助函式：標準化地點字串 (移除空白、括號等)
    const normalize = (str) => (str || '').replace(/[()\s\-\uff08\uff09]/g, '').toLowerCase();

    for (const evt of allNewEvents) {
        // 1. 嘗試在已加入的清單中找到重複活動
        const duplicateIndex = uniqueEvents.findIndex(existing => {
            // 必須是同一天
            if (existing.date !== evt.date) return false;

            // 必須是同一個縣市 (如果有資料)
            if (existing.city && evt.city && existing.city !== evt.city) return false;

            const loc1 = normalize(existing.location);
            const loc2 = normalize(evt.location);

            // 判斷地點是否高度相似或包含
            const isMatch = loc1.includes(loc2) || loc2.includes(loc1);
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
    const cleanedEvents = sanitizeData(uniqueEvents);

    fs.writeFileSync(outputPath, JSON.stringify(cleanedEvents, null, 2));
    console.log(`\n總共成功更新 ${cleanedEvents.length} 筆活動資料！`);
}

updateEvents();
