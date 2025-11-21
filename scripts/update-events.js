import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OpenAI = require('openai');
const cheerio = require('cheerio');

// 初始化 OpenAI 客戶端
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const TARGET_URL = 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284';
const BASE_URL = 'https://www.tp.blood.org.tw';

async function fetchHTML(url) {
    const response = await fetch(url);
    return await response.text();
}

async function getLatestEventPage() {
    console.log(`正在抓取列表頁面: ${TARGET_URL}`);
    const html = await fetchHTML(TARGET_URL);
    const $ = cheerio.load(html);

    // 尋找包含 "假日捐血活動" 的最新連結
    const link = $('a:contains("假日捐血活動")').first();
    if (link.length > 0) {
        const href = link.attr('href');
        const title = link.text().trim();
        console.log(`找到最新活動頁面: ${title}`);
        return href.startsWith('http') ? href : BASE_URL + href;
    }
    throw new Error('找不到假日捐血活動頁面');
}

async function extractImagesFromPage(url) {
    console.log(`正在抓取詳情頁面: ${url}`);
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);

    const images = [];
    // 抓取主要內容區塊內的圖片
    // 根據之前的觀察，圖片可能在 .editor 區塊或其他容器中
    $('img').each((i, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('file_pool') || src.includes('upload'))) {
            const fullUrl = src.startsWith('http') ? src : BASE_URL + src;
            // 排除一些顯然不是海報的小圖示
            if (!fullUrl.includes('icon') && !fullUrl.includes('logo')) {
                images.push(fullUrl);
            }
        }
    });

    console.log(`找到 ${images.length} 張潛在海報圖片`);
    return [...new Set(images)]; // 去重
}

async function analyzeImageWithAI(imageUrl) {
    console.log(`正在使用 AI 分析圖片: ${imageUrl}`);

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "請分析這張捐血活動海報，並提取以下資訊為 JSON 格式：\n1. date (日期，格式 YYYY-MM-DD)\n2. time (時間，例如 09:00-17:00)\n3. location (地點名稱)\n4. gift (贈品內容，簡潔描述)\n\n如果是總表，請回傳 null。如果是單一活動海報，請回傳 JSON 物件。請只回傳 JSON 字串，不要有 markdown 標記。" },
                        { type: "image_url", image_url: { url: imageUrl } },
                    ],
                },
            ],
            max_tokens: 300,
        });

        const content = response.choices[0].message.content.trim();
        // 移除可能的 markdown code block
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '');

        try {
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
        if (!process.env.OPENAI_API_KEY) {
            console.error('錯誤: 未設定 OPENAI_API_KEY 環境變數');
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
                    tags: ['AI辨識', '自動更新']
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
