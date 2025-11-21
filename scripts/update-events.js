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

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

        const prompt = `請分析這張捐血活動海報。
嚴格區分：這張圖片是「單一活動海報」還是「多地點總表」？

1. 如果是「多地點總表」(包含多個不同地點、列表形式、密密麻麻的文字)，請直接回傳 null。絕對不要提取總表的資料，因為缺乏贈品細節。
2. 只有當圖片是針對「單一特定地點」或「單一特定活動」的宣傳海報，且包含具體的「贈品資訊」(例如：送全聯禮券、紀念傘、電影票等) 時，才提取資料。

若符合第 2 點，請提取以下資訊為 JSON 格式：
- date (日期，格式 YYYY-MM-DD，若海報只有寫 11/23 請自動補上年份 2025)
- time (時間，例如 09:00-17:00)
- location (地點名稱，請完整提取，例如 "忠孝號 (東區地下街9號出口)")
- gift (贈品內容，請詳細描述，例如 "環保購物袋+飲料提袋")

請只回傳 JSON 字串，不要有 markdown 標記。`;

        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: "image/jpeg",
            },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            if (jsonStr.toLowerCase() === 'null') return null;
            return JSON.parse(jsonStr);
        } catch (e) {
            console.log('AI 回傳非 JSON 格式，跳過');
            return null;
        }
    } catch (error) {
        console.error(`AI 分析失敗: ${error.message}`);
        return null;
    }
}

const updateEvents = async () => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error('錯誤: 未設定 GEMINI_API_KEY 環境變數');
            process.exit(1);
        }

        const detailPageUrl = await getLatestEventPage();
        const imageUrls = await extractImagesFromPage(detailPageUrl);

        const newEvents = [];

        for (const imgUrl of imageUrls) {
            const eventData = await analyzeImageWithAI(imgUrl);
            if (eventData) {
                console.log('成功提取活動:', eventData);
                newEvents.push({
                    id: Date.now() + Math.random(),
                    title: `[AI辨識] ${eventData.location} 捐血活動`,
                    date: eventData.date,
                    time: eventData.time,
                    location: eventData.location,
                    organizer: '台北捐血中心',
                    gift: {
                        name: eventData.gift,
                        value: 300, // 預設值
                        quantity: '依現場為主',
                        image: imgUrl
                    },
                    posterUrl: imgUrl,
                    sourceUrl: detailPageUrl,
                    tags: ['AI辨識', '自動更新', 'Gemini']
                });
            }
        }

        if (newEvents.length > 0) {
            const outputPath = path.join(__dirname, '../src/data/events.json');
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
