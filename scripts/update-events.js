import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const eventsFilePath = path.join(__dirname, '../src/data/events.json');

// 模擬從外部來源抓取資料 (這裡填入從圖片辨識出的真實資料)
const fetchNewEvents = async () => {
    console.log('正在從外部來源抓取資料 (模擬 OCR 辨識)...');

    const realData = [
        // 11/22 (六)
        { time: "09:00-17:00", location: "關渡捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "長庚捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "西門捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "板橋捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "捷運捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "市府捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "三重捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "汐止捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "樹林捐血室", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "宜蘭捐血站", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "羅東捐血站", gift: "紀念傘", date: "2025-11-22" },
        { time: "09:00-17:00", location: "花蓮捐血站", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "新光站前", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "忠孝號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "峨嵋號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "大安號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "仁愛號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "南港號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "關渡號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "新店號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "基隆號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "宜蘭號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-18:00", location: "花蓮號", gift: "紀念傘", date: "2025-11-22" },
        { time: "10:00-17:00", location: "汐止麥帥橋下", gift: "全聯禮券+紀念品", date: "2025-11-22" },
        { time: "09:30-16:30", location: "國父紀念館", gift: "全聯禮券+紀念品", date: "2025-11-22" },

        // 11/23 (日)
        { time: "09:00-17:00", location: "關渡捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "長庚捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "西門捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "板橋捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "捷運捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "市府捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "三重捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "汐止捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "樹林捐血室", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "宜蘭捐血站", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "羅東捐血站", gift: "紀念傘", date: "2025-11-23" },
        { time: "09:00-17:00", location: "花蓮捐血站", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "新光站前", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "忠孝號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "峨嵋號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "大安號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "仁愛號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "南港號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "關渡號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "新店號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "基隆號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "宜蘭號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-18:00", location: "花蓮號", gift: "紀念傘", date: "2025-11-23" },
        { time: "10:00-17:00", location: "汐止麥帥橋下", gift: "全聯禮券+紀念品", date: "2025-11-23" },
        { time: "09:30-16:30", location: "國父紀念館", gift: "全聯禮券+紀念品", date: "2025-11-23" }
    ];

    const poster1122 = 'https://www.tp.blood.org.tw/files/file_pool/1/0P323309946552669872/2.png';
    const summaryPoster = 'https://www.tp.blood.org.tw/files/file_pool/1/0P323309945918790744/1.png';
    const sourcePage = 'https://www.tp.blood.org.tw/xmdoc/cont?xsmsid=0P062646965467323284&sid=0P323309163207812233';

    return realData.map((item, index) => ({
        id: Date.now() + index,
        title: `[自動更新] ${item.location} 捐血活動`,
        date: item.date,
        time: item.time,
        location: item.location,
        organizer: '台北捐血中心',
        gift: {
            name: item.gift,
            value: item.gift.includes('全聯') ? 500 : 300,
            quantity: '依現場為主',
            image: item.date === '2025-11-22' ? poster1122 : summaryPoster
        },
        posterUrl: item.date === '2025-11-22' ? poster1122 : summaryPoster,
        sourceUrl: sourcePage,
        tags: ['自動更新', '最新活動', '海報辨識']
    }));
};

const updateEvents = async () => {
    try {
        // 1. 抓取新資料 (這裡會覆蓋舊資料，因為使用者說只要這些)
        const newEvents = await fetchNewEvents();

        // 2. 寫回檔案 (直接覆蓋)
        fs.writeFileSync(eventsFilePath, JSON.stringify(newEvents, null, 2), 'utf-8');

        console.log(`成功更新資料！目前共有 ${newEvents.length} 筆活動。`);

    } catch (error) {
        console.error('更新失敗:', error);
        process.exit(1);
    }
};

updateEvents();
