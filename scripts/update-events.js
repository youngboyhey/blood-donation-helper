import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const eventsFilePath = path.join(__dirname, '../src/data/events.json');

// 模擬從外部來源抓取資料
const fetchNewEvents = async () => {
    console.log('正在從外部來源抓取資料...');

    // 這裡模擬一個 API 請求或爬蟲過程
    // 實際應用中，這裡會是 fetch('https://api.example.com/events') 或 Puppeteer 腳本

    const today = new Date();
    const dateString = today.toISOString().split('T')[0];

    const newEvent = {
        id: Date.now(), // 使用 timestamp 當作 ID
        title: `[自動更新] 台北車站捐血活動 (${new Date().toLocaleTimeString()})`,
        date: dateString,
        time: '10:00 - 18:00',
        location: '台北車站大廳',
        organizer: '台北捐血中心',
        gift: {
            name: '全聯禮券 300元 + 紀念品',
            value: 300,
            quantity: '限量 200 份',
            image: 'https://placehold.co/100x100?text=Update'
        },
        tags: ['自動更新', '最新消息']
    };

    return [newEvent];
};

const updateEvents = async () => {
    try {
        // 1. 讀取現有資料
        const rawData = fs.readFileSync(eventsFilePath, 'utf-8');
        const events = JSON.parse(rawData);

        // 2. 抓取新資料
        const newEvents = await fetchNewEvents();

        // 3. 合併資料 (這裡簡單做 append，實際可能需要去重)
        const updatedEvents = [...events, ...newEvents];

        // 4. 寫回檔案
        fs.writeFileSync(eventsFilePath, JSON.stringify(updatedEvents, null, 2), 'utf-8');

        console.log(`成功更新資料！目前共有 ${updatedEvents.length} 筆活動。`);
        console.log('新增活動:', newEvents[0].title);

    } catch (error) {
        console.error('更新失敗:', error);
        process.exit(1);
    }
};

updateEvents();
