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
        type: 'google',
        id: 'taichung',
        name: '台中捐血中心',
        query: '台中捐血中心 捐血活動 贈品',
        city: '台中市'
    },
    {
        type: 'google',
        id: 'kaohsiung',
        name: '高雄捐血中心',
        query: '高雄捐血中心 捐血活動 贈品',
        city: '高雄市'
    },
    {
        type: 'google',
        id: 'tainan',
        name: '台南捐血中心',
        query: '台南捐血中心 捐血活動 贈品',
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

async function fetchGoogleImages(source) {
    console.log(`[Google] 正在搜尋圖片: ${source.query}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        // 建構 Google 圖片搜尋 URL (tbm=isch: 圖片搜尋, tbs=qdr:w: 過去一週)
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbm=isch&tbs=qdr:w`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 隨機延遲，模擬人類行為
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

        // 滾動一點點以觸發載入
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 2000));

        // 提取圖片連結
        // Google 圖片搜尋結果結構複雜，這裡嘗試抓取縮圖或原始圖連結
        // 為了簡單起見，我們先抓取縮圖 (通常在 img 標籤中)
        // 若要抓大圖需要點擊，這裡先從簡單的開始，讓 AI 分析縮圖 (Gemini 對縮圖辨識能力也不錯)
        const imageUrls = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            return images
                .map(img => img.src)
                .filter(src => src && src.startsWith('http') && !src.includes('google') && !src.includes('gstatic.com/images?q=tbn')) // 嘗試過濾掉 Google 的 icon
                // Google 搜尋結果的圖片通常是 base64 或加密網址，或者 gstatic
                // 讓我們放寬一點，抓取所有看起來像圖片的
                .filter(src => src && src.length > 100); // 過濾掉太小的圖示
        });

        // 針對 Google 圖片結構的特殊處理
        // 現代 Google 圖片搜尋的縮圖通常是 base64 或者 data:image
        // 我們嘗試抓取主要的結果區塊
        const resultImages = await page.evaluate(() => {
            const results = document.querySelectorAll('div[data-id] img'); // 嘗試定位結果圖片
            return Array.from(results).map(img => img.src).filter(src => src);
        });

        const finalImages = resultImages.length > 0 ? resultImages : imageUrls;

        console.log(`[Google] 找到 ${finalImages.length} 張潛在圖片，取前 20 張...`);

        const uniqueImages = [...new Set(finalImages)].slice(0, 20);

        return uniqueImages.map(url => ({ type: 'image', url, sourceUrl: searchUrl }));

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
                const lowerUrl = imgUrl.toLowerCase();

                // Enhanced filtering to exclude non-poster images (Re-applied fix)
                if (!lowerUrl.includes('icon') &&
                    !lowerUrl.includes('logo') &&
                    !lowerUrl.endsWith('.svg') &&
                    !lowerUrl.endsWith('.gif') &&
                    !lowerUrl.includes('qr') &&
                    !lowerUrl.includes('line') &&
                    !lowerUrl.includes('fb') &&
                    !lowerUrl.includes('ig')) {

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
3. 如果圖片模糊不清或不是捐血活動海報，請回傳 null。

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
            // 找到重複，保留資訊較完整的那一個
            const existing = uniqueEvents[duplicateIndex];

            // 判斷標準：
            // 1. 有海報優先
            // 2. 地點字串較長優先 (通常較詳細)
            // 3. 有贈品資訊優先

            let keepNew = false;

            if (evt.posterUrl && !existing.posterUrl) keepNew = true;
            else if (!evt.posterUrl && existing.posterUrl) keepNew = false;
            else {
                // 都有或都沒有海報，比地點長度
                if ((evt.location || '').length > (existing.location || '').length) keepNew = true;
            }

            if (keepNew) {
                console.log(`[去重] 取代舊活動: 保留 "${evt.title}" (${evt.location}), 移除 "${existing.title}"`);
                uniqueEvents[duplicateIndex] = evt;
            } else {
                console.log(`[去重] 保留舊活動: "${existing.title}" (${existing.location}), 忽略 "${evt.title}"`);
            }
        } else {
            uniqueEvents.push(evt);
        }
    }

    console.log(`[去重] 完成，剩餘 ${uniqueEvents.length} 筆活動 (原始 ${allNewEvents.length} 筆)`);

    fs.writeFileSync(outputPath, JSON.stringify(uniqueEvents, null, 2));
    console.log(`\n總共成功更新 ${uniqueEvents.length} 筆活動資料！`);
};

updateEvents();
