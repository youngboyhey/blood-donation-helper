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
        url: 'https://www.facebook.com/tcblood',
        city: '台中市'
    },
    {
        type: 'fb',
        id: 'kaohsiung',
        name: '高雄捐血中心',
        url: 'https://www.facebook.com/ksblood',
        city: '高雄市'
    },
    {
        type: 'fb',
        id: 'tainan',
        name: '台南捐血中心',
        url: 'https://www.facebook.com/tnblood',
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
    console.log(`[Facebook] 正在抓取粉絲頁: ${source.name} (${source.url})`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // 嘗試關閉登入彈窗 (如果有的話)
        try {
            const closeButtonSelector = 'div[aria-label="Close"], div[aria-label="關閉"]';
            await page.waitForSelector(closeButtonSelector, { timeout: 5000 });
            await page.click(closeButtonSelector);
        } catch (e) {
            // 忽略，可能沒有彈窗
        }

        // 滾動頁面以加載更多貼文
        console.log('[Facebook] 滾動頁面載入貼文...');
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(r => setTimeout(r, 2000));
        }

        // 提取圖片
        const imageUrls = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            return images
                .map(img => img.src)
                .filter(src => {
                    // 過濾掉小圖示、頭像等
                    // FB 貼文圖片通常包含 'scontent' 且尺寸較大
                    // 這裡簡單用 URL 特徵和自然寬度過濾 (如果能獲取的話)
                    return src.includes('https://') &&
                        (src.includes('scontent') || src.includes('fbcdn')) &&
                        !src.includes('emoji') &&
                        !src.includes('icon');
                });
        });

        // 進一步過濾重複和明顯無效的圖
        const uniqueImages = [...new Set(imageUrls)].slice(0, 5); // 限制處理前 5 張最新圖片，避免過多

        console.log(`[Facebook] 找到 ${uniqueImages.length} 張潛在圖片`);
        await browser.close();
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

        console.log(`[Web] 找到 ${images.length} 張圖片`);
        return [...new Set(images)];

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

async function analyzeImageWithAI(imageUrl, sourceContext) {
    console.log(`[AI] 正在分析圖片 (${sourceContext.city}): ${imageUrl.substring(0, 50)}...`);

    try {
        const base64Image = await fetchImageAsBase64(imageUrl);
        if (!base64Image) return null;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `請分析這張捐血活動海報。
來源脈絡：這張海報來自「${sourceContext.name}」，地點通常位於「${sourceContext.city}」。

嚴格區分：這張圖片是「單一活動海報」還是「多地點總表」？

1. 如果是「多地點總表」(包含多個不同地點、列表形式、密密麻麻的文字)，請直接回傳 null。
2. 只有當圖片是針對「單一特定地點」或「單一特定活動」的宣傳海報，且包含具體的「贈品資訊」(例如：送全聯禮券、紀念傘、電影票等) 時，才提取資料。

請以 JSON 格式回傳以下欄位 (若無資料請填 null):
{
  "title": "活動標題",
  "date": "日期 (YYYY-MM-DD)",
  "time": "時間 (HH:MM-HH:MM)",
  "location": "地點 (請盡量完整，若海報只寫地標，請結合來源城市 '${sourceContext.city}' 推斷完整地址)",
  "city": "縣市 (預設: ${sourceContext.city})",
  "district": "行政區 (例如: 大安區, 板橋區)",
  "organizer": "主辦單位 (預設: ${sourceContext.name})",
  "gift": {
    "name": "贈品名稱 (包含所有贈品項目)",
    "image": "圖片URL (程式會自動填入)"
  },
  "tags": ["AI辨識", "自動更新", "${sourceContext.city}"]
}
`;

        const result = await model.generateContent([prompt, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }]);
        const response = await result.response;
        const text = response.text();
        const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        if (jsonStr === 'null') return null;

        try {
            return JSON.parse(jsonStr);
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

    for (const source of SOURCES) {
        console.log(`\n=== 開始處理來源: ${source.name} ===`);
        let images = [];

        if (source.type === 'web') {
            images = await fetchWebImages(source);
        } else if (source.type === 'fb') {
            images = await fetchFacebookImages(source);
        }

        console.log(`[${source.name}] 準備分析 ${images.length} 張圖片...`);

        for (const img of images) {
            const eventData = await analyzeImageWithAI(img, source);
            if (eventData) {
                eventData.posterUrl = img;
                eventData.sourceUrl = source.url;
                if (eventData.gift) {
                    eventData.gift.image = img;
                }
                eventData.id = Date.now() + Math.random();
                allNewEvents.push(eventData);
                console.log(`[成功] 提取活動: ${eventData.title} (${eventData.location})`);
            }
        }
    }

    if (allNewEvents.length > 0) {
        const outputPath = path.join(__dirname, '../src/data/events.json');
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 讀取現有資料以保留 (可選，目前策略是覆蓋或合併？)
        // 這裡我們選擇覆蓋，因為這是每日更新的腳本。
        // 但為了避免清空舊資料，我們應該考慮合併。
        // 暫時策略：覆蓋，因為舊資料會過期。

        fs.writeFileSync(outputPath, JSON.stringify(allNewEvents, null, 2));
        console.log(`\n總共成功更新 ${allNewEvents.length} 筆活動資料！`);
    } else {
        console.log('\n未提取到任何有效活動資料。');
    }
};

updateEvents();
