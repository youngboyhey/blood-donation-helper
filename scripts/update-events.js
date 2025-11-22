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
    {
        type: 'fb',
        id: 'taichung',
        name: '台中捐血中心',
        url: 'https://www.facebook.com/tcblood/photos',
        city: '台中市'
    },
    {
        type: 'fb',
        id: 'kaohsiung',
        name: '高雄捐血中心',
        url: 'https://www.facebook.com/TBSFksblood/photos',
        city: '高雄市'
    },
    {
        type: 'fb',
        id: 'tainan',
        name: '台南捐血中心',
        url: 'https://www.facebook.com/tnblood/photos',
        city: '台南市'
    }
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

async function fetchFacebookImages(source) {
    console.log(`[Facebook] 正在抓取粉絲頁相簿: ${source.name} (${source.url}) - v20251122-fix-logging`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 啟用瀏覽器 console log 轉發 (用於除錯)
    page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

    // 設定 Cookies (若有提供)
    const c_user = process.env.FB_COOKIE_C_USER;
    const xs = process.env.FB_COOKIE_XS;

    if (c_user && xs) {
        console.log('[Facebook] 檢測到 Cookies，嘗試模擬登入...');
        await page.setCookie(
            { name: 'c_user', value: c_user, domain: '.facebook.com' },
            { name: 'xs', value: xs, domain: '.facebook.com' }
        );
    } else {
        console.log('[Facebook] 未檢測到 Cookies，將以訪客身份瀏覽 (可能受限)');
    }

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // 檢查是否被導向登入頁
        const url = page.url();
        if (url.includes('login') || url.includes('checkpoint')) {
            console.warn('[Facebook] 警告: 被導向登入頁面，Cookies 可能無效或過期。');
        } else if (c_user && xs) {
            console.log('[Facebook] 成功以登入狀態進入頁面');
        }

        // 嘗試關閉登入彈窗
        try {
            const closeButtonSelector = 'div[aria-label="Close"], div[aria-label="關閉"]';
            await page.waitForSelector(closeButtonSelector, { timeout: 5000 });
            await page.click(closeButtonSelector);
        } catch (e) {
            // 忽略
        }

        // 智慧滾動：只滾動直到收集到足夠的連結
        let photoLinks = [];
        let retries = 0;
        const MAX_RETRIES = 5; // 最多滾動 5 次
        const TARGET_COUNT = 20;

        console.log('[Facebook] 開始抓取連結 (目標 20 篇)...');

        while (photoLinks.length < TARGET_COUNT && retries < MAX_RETRIES) {
            const newLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links
                    .map(a => a.href)
                    .filter(href => {
                        if (!href) return false;
                        // 寬鬆過濾，確保不漏掉
                        const isPhoto = href.includes('/photo.php') || href.includes('/photos/') || href.includes('/photo/');
                        // 排除明顯的導航頁
                        const isNav = href.endsWith('/photos') || href.endsWith('/photos/') || href.includes('/photos_by') || href.includes('/albums');
                        return isPhoto && !isNav;
                    });
            });

            // 去重
            const uniqueLinks = [...new Set(newLinks)];

            if (uniqueLinks.length >= TARGET_COUNT) {
                photoLinks = uniqueLinks.slice(0, TARGET_COUNT);
                break;
            }

            console.log(`[Facebook] 目前找到 ${uniqueLinks.length} 個連結，滾動載入更多... (${retries + 1}/${MAX_RETRIES})`);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 3000)); // 等待載入
            retries++;
            photoLinks = uniqueLinks;
        }

        // 如果還是不夠，就用抓到的所有連結
        if (photoLinks.length === 0) {
            // 最後嘗試一次獲取
            photoLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links
                    .map(a => a.href)
                    .filter(href => href && (href.includes('/photo.php') || href.includes('/photos/')))
                    .slice(0, 20);
            });
        }

        console.log(`[Facebook] 最終找到 ${photoLinks.length} 個相片連結，準備進入詳情頁抓取大圖...`);

        const highResImages = [];

        // 2. 逐一進入詳情頁抓大圖
        for (const link of photoLinks) {
            try {
                let imgUrl = null;
                console.log(`[Facebook] 進入詳情頁: ${link}`);
                const pageDesktop = await browser.newPage();

                // ADDED: Console listener for detail page
                pageDesktop.on('console', msg => console.log(`[Browser Detail] ${msg.text()}`));

                // 設定 Cookies
                if (c_user && xs) {
                    await pageDesktop.setCookie(
                        { name: 'c_user', value: c_user, domain: '.facebook.com' },
                        { name: 'xs', value: xs, domain: '.facebook.com' }
                    );
                }
                await pageDesktop.close();

                if (imgUrl) {
                    console.log(`[Facebook] 成功抓取圖片: ${imgUrl.substring(0, 50)}...`);
                    highResImages.push({
                        type: 'image',
                        url: imgUrl,
                        postUrl: link
                    });
                } else {
                    console.log(`[Facebook] 放棄此連結，無法提取圖片`);
                }

                await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                console.error(`[Facebook] 處理連結失敗: ${link}`, err);
            }
        }

        await browser.close();
        // 去重
        const uniqueImages = [];
        const seenUrls = new Set();
        for (const img of highResImages) {
            if (!seenUrls.has(img.url)) {
                seenUrls.add(img.url);
                uniqueImages.push(img);
            }
        }
        return uniqueImages;

    } catch (error) {
        console.error(`[Facebook] 抓取失敗 ${source.name}:`, error);
        await browser.close();
        return [];
    }
}

async function fetchWebImages(source) {
    console.log(`[Web] 正在抓取官網: ${source.name} (${source.url})`);
    try {
        const html = await fetchHTMLWithPuppeteer(source.url);
        const $ = cheerio.load(html);

        // 尋找包含 "假日捐血活動" 或 "捐血活動" 的最新連結
        let targetLink = null;
        const links = $('a');

        links.each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('假日捐血活動') || text.includes('捐血活動場次')) {
                targetLink = $(el);
                return false; // break loop
            }
        });

        if (!targetLink) {
            console.log(`[Web] 在 ${source.name} 找不到活動連結，跳過。`);
            return [];
        }

        let href = targetLink.attr('href');
        if (!href) return [];

        const fullUrl = href.startsWith('http') ? href : source.baseUrl + href;
        console.log(`[Web] 找到活動頁面: ${fullUrl}`);

        const detailHtml = await fetchHTMLWithPuppeteer(fullUrl);
        const $detail = cheerio.load(detailHtml);
        const images = [];

        $detail('img').each((i, el) => {
            const src = $detail(el).attr('src');
            if (src && (src.includes('file_pool') || src.includes('upload'))) {
                const imgUrl = src.startsWith('http') ? src : source.baseUrl + src;
                if (!imgUrl.includes('icon') && !imgUrl.includes('logo')) {
                    images.push(imgUrl);
                }
            }
        });

        // 如果找不到圖片，嘗試提取純文字內容 (針對新竹捐血中心等純文字公告)
        if (images.length === 0) {
            console.log(`[Web] 找不到圖片，嘗試提取文字內容...`);
            // 移除 script, style 等干擾元素
            $detail('script').remove();
            $detail('style').remove();
            $detail('nav').remove();
            $detail('header').remove();
            $detail('footer').remove();

            // 提取主要內容區塊 (通常是 article 或 main，或直接 body)
            // 這裡簡單提取 body text，讓 AI 去過濾
            const textContent = $detail('body').text().replace(/\s+/g, ' ').trim();

            // 簡單判斷內容長度，避免提取到空頁面
            if (textContent.length > 100) {
                console.log(`[Web] 提取到文字內容 (${textContent.length} 字)`);
                return [{ type: 'text', content: textContent, url: fullUrl }];
            }
        }

        console.log(`[Web] 找到 ${images.length} 張圖片`);
        return [...new Set(images)].map(url => ({ type: 'image', url }));

    } catch (error) {
        console.error(`[Web] 抓取失敗 ${source.name}:`, error);
        return [];
    }
}

async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`取得圖片失敗: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
        console.error(`[Fetch] 圖片下載失敗: ${url}`);
        return null;
    }
}

async function analyzeContentWithAI(item, sourceContext) {
    const isImage = item.type === 'image';
    const contentPreview = isImage ? item.url : item.content.substring(0, 50);
    console.log(`[AI] 正在分析${isImage ? '圖片' : '文字'} (${sourceContext.city}): ${contentPreview}...`);

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        let prompt = '';
        let parts = [];
        const today = new Date().toISOString().split('T')[0];

        if (isImage) {
            const base64Image = await fetchImageAsBase64(item.url);
            if (!base64Image) return null;

            prompt = `請分析這張捐血活動海報。
來源脈絡：這張海報來自「${sourceContext.name}」，地點通常位於「${sourceContext.city}」及其周邊縣市（例如新竹中心涵蓋桃園、苗栗；台北中心涵蓋新北）。
今天是 ${today}，請特別留意活動日期。

嚴格區分：
1. 如果是「多地點總表」或「過期活動」(日期在 ${today} 之前)，請回傳 null。
2. 只有當圖片是「單一活動海報」且日期是「今天或未來」的活動，才提取資料。

請以 JSON 格式回傳以下欄位 (若無資料請填 null):
{
  "title": "活動標題",
  "date": "日期 (YYYY-MM-DD)",
  "time": "時間 (HH:MM-HH:MM)",
  "location": "地點 (請盡量完整，若海報只寫地標，請結合來源城市推斷完整地址)",
  "city": "縣市 (請務必從地點判斷，例如：桃園市、苗栗縣、新北市。若無法判斷才填 ${sourceContext.city})",
  "district": "行政區 (例如: 大安區, 板橋區)",
  "organizer": "主辦單位 (預設: ${sourceContext.name})",
  "gift": {
    "name": "贈品名稱 (包含所有贈品項目)",
    "image": "圖片URL (程式會自動填入)"
  },
  "tags": ["AI辨識", "自動更新", "縣市名稱(請填入實際判斷的縣市)"]
}
`;
            parts = [prompt, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }];
        } else {
            // 文字分析模式
            prompt = `請分析以下捐血活動公告文字。
來源脈絡：來自「${sourceContext.name}」，地點通常位於「${sourceContext.city}」及其周邊縣市（例如新竹中心涵蓋桃園、苗栗；台北中心涵蓋新北）。
今天是 ${today}，請特別留意活動日期。

請從文字中提取「單一」或「多個」捐血活動資訊。
注意：
1. 只提取日期在「今天或未來」的活動。
2. 如果文字包含多個不同時間地點的活動，請回傳一個 JSON 陣列 (Array of Objects)。
3. 如果只有一個活動，也請回傳包含一個物件的陣列。

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
    "district": "行政區 (例如: 大安區, 板橋區)",
    "organizer": "主辦單位 (預設: ${sourceContext.name})",
    "gift": {
      "name": "贈品名稱 (若文中未提及具體贈品，請填 null)",
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
        } else if (source.type === 'fb') {
            items = await fetchFacebookImages(source);
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
            const eventDataList = await analyzeContentWithAI(item, source);

            if (eventDataList && eventDataList.length > 0) {
                for (const eventData of eventDataList) {
                    if (!eventData) continue;

                    // 日期過濾：只保留今天以後的活動
                    if (eventData.date) {
                        const eventDate = new Date(eventData.date);
                        if (eventDate < today) {
                            console.log(`[跳過] 過期活動: ${eventData.title} (${eventData.date})`);
                            continue;
                        }
                    }

                    if (item.type === 'image') {
                        eventData.posterUrl = item.url;
                        if (eventData.gift) {
                            eventData.gift.image = item.url;
                        }
                    }
                    eventData.sourceUrl = item.postUrl || item.url || source.url;
                    eventData.id = Date.now() + Math.random();

                    if (eventData.date && eventData.location) {
                        allNewEvents.push(eventData);
                        console.log(`[成功] 提取活動: ${eventData.title} (${eventData.location})`);
                    }
                }
            }
        }
    }

    if (allNewEvents.length > 0) {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 去重
        const uniqueEvents = [];
        const seenKeys = new Set();

        for (const evt of allNewEvents) {
            const key = `${evt.posterUrl}-${evt.date}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueEvents.push(evt);
            }
        }

        fs.writeFileSync(outputPath, JSON.stringify(uniqueEvents, null, 2));
        console.log(`\n總共成功更新 ${uniqueEvents.length} 筆活動資料！`);
    } else {
        console.log('\n未提取到任何有效活動資料。');
    }
};

updateEvents();
