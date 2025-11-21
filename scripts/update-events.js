import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化 Gemini 客戶端
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const TARGET_URL = 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284';
const BASE_URL = 'https://www.tp.blood.org.tw';

async function fetchHTMLWithPuppeteer(url) {
    console.log(`[Puppeteer] Launching browser to fetch: ${url}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for GitHub Actions
    });
    const page = await browser.newPage();

    // Set a real User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const content = await page.content();
        await browser.close();
        return content;
    } catch (error) {
        console.error(`[Puppeteer] Error fetching ${url}:`, error);
        await browser.close();
        throw error;
    }
}

async function fetchImageAsBase64(url) {
    // For images, we can still try fetch, but if it fails, we might need puppeteer too.
    // Let's try fetch with headers first as it's faster.
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
        console.error(`[Fetch] Image fetch failed, trying Puppeteer for image: ${url}`);
        return null;
    }
}

async function getLatestEventPage() {
    console.log(`正在抓取列表頁面: ${TARGET_URL}`);
    const html = await fetchHTMLWithPuppeteer(TARGET_URL);
    console.log(`取得 HTML 長度: ${html.length}`);
    const $ = cheerio.load(html);

    // 尋找包含 "假日捐血活動" 的最新連結
    let targetLink = null;
    const links = $('a');

    links.each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('假日捐血活動')) {
            targetLink = $(el);
            return false; // break loop
        }
    });

    if (targetLink) {
        const href = targetLink.attr('href');
        const title = targetLink.text().trim();
        console.log(`找到最新活動頁面: ${title}`);
        return href.startsWith('http') ? href : BASE_URL + href;
    }

    // Debug
    console.log('找不到目標連結，列出前 10 個連結:');
    links.slice(0, 10).each((i, el) => {
        console.log(`- ${$(el).text().trim()}`);
    });

    throw new Error('找不到假日捐血活動頁面');
}

async function extractImagesFromPage(url) {
    console.log(`正在抓取詳情頁面: ${url}`);
    const html = await fetchHTMLWithPuppeteer(url);
    const $ = cheerio.load(html);

    const images = [];
    $('img').each((i, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('file_pool') || src.includes('upload'))) {
            const fullUrl = src.startsWith('http') ? src : BASE_URL + src;
            if (!fullUrl.includes('icon') && !fullUrl.includes('logo')) {
                images.push(fullUrl);
            }
        }
    });

    console.log(`找到 ${images.length} 張潛在海報圖片`);
    return [...new Set(images)]; // 去重
}

async function analyzeImageWithAI(imageUrl) {
    console.log(`正在使用 Gemini AI 分析圖片: ${imageUrl}`);

    try {
        const base64Image = await fetchImageAsBase64(imageUrl);
        if (!base64Image) return null;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `請分析這張捐血活動海報。
嚴格區分：這張圖片是「單一活動海報」還是「多地點總表」？

1. 如果是「多地點總表」(包含多個不同地點、列表形式、密密麻麻的文字)，請直接回傳 null。絕對不要提取總表的資料，因為缺乏贈品細節。
2. 只有當圖片是針對「單一特定地點」或「單一特定活動」的宣傳海報，且包含具體的「贈品資訊」(例如：送全聯禮券、紀念傘、電影票等) 時，才提取資料。

請以 JSON 格式回傳以下欄位 (若無資料請填 null):
{
  "title": "活動標題",
  "date": "日期 (YYYY-MM-DD)",
  "time": "時間 (HH:MM-HH:MM)",
  "location": "地點",
  "organizer": "主辦單位 (預設: 台北捐血中心)",
  "gift": {
    "name": "贈品名稱 (包含所有贈品項目)",
    "value": "預估總價值 (數字, 若無法估算請填 300)",
    "quantity": "數量 (例如: 依現場為主, 送完為止)"
  },
  "tags": ["AI辨識", "自動更新", "Gemini"]
}
`;

        const result = await model.generateContent([prompt, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }]);
        const response = await result.response;
        const text = response.text();

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

        if (jsonStr === 'null') return null;

        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON:", text);
            return null;
        }

    } catch (error) {
        console.error(`AI Analysis failed for ${imageUrl}:`, error);
        return null;
    }
}

async function updateEvents() {
    try {
        const pageUrl = await getLatestEventPage();
        const images = await extractImagesFromPage(pageUrl);

        const newEvents = [];
        for (const img of images) {
            const eventData = await analyzeImageWithAI(img);
            if (eventData) {
                // Add image URL to the event data
                eventData.posterUrl = img;
                eventData.sourceUrl = pageUrl;
                if (eventData.gift) {
                    eventData.gift.image = img;
                }
                // Generate a unique ID
                eventData.id = Date.now() + Math.random();
                newEvents.push(eventData);
            }
        }

        if (newEvents.length > 0) {
            const outputPath = path.join(__dirname, '../src/data/events.json');
            // Ensure directory exists
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, JSON.stringify(newEvents, null, 2));
            console.log(`成功更新 ${newEvents.length} 筆活動資料！`);
        } else {
            console.log('未提取到任何有效活動資料。');
        }

    } catch (error) {
        console.error('更新失敗:', error);
        process.exit(1);
    }
};

updateEvents();
