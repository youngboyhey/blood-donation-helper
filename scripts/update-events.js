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
        { time: "11:00-19:00", location: "忠孝號 (東區地下街9號出口)", gift: "環保購物袋/飲料提袋", date: "2025-11-23" },
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

    const summaryPoster = 'https://www.tp.blood.org.tw/files/file_pool/1/0P323309945918790744/1.png';
    const sourcePage = 'https://www.tp.blood.org.tw/xmdoc/cont?xsmsid=0P062646965467323284&sid=0P323309163207812233';

    // 海報對照表 (從檔案名稱或內容推測)
    const posterMap = {
        '2025-11-22': {
            '三重': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323310688819265871/1122%E4%B8%89%E9%87%8D.jpg',
            '大安': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323310689098013826/1122%E5%A4%A7%E5%AE%89.jpg',
            '基隆': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323310692712314815/1122%E5%9F%BA%E9%9A%86.jpg',
            '長春': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323310680355719815/1122%E9%95%B7%E6%98%A5.png', // 可能對應長庚? 暫且保留
            '公園': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323310689632992843/1122%E5%85%AC%E5%9C%92.jpg',
            '威秀': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323310681533566860/1122%E5%A8%81%E7%A7%80.jpg',
        },
        '2025-11-23': {
            '汐止': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323311187605364869/1123%E6%B1%90%E6%AD%A2.jpg',
            '忠孝': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323311188783112813/1123%E5%BF%A0%E5%AD%9D.jpg',
            '基隆': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323323145699192862/1123%E5%9F%BA%E9%9A%86.jpg',
            '蘆洲': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323311181863435985/1123%E8%98%86%E6%B4%B2.jpg',
            '威秀': 'https://www.tp.blood.org.tw/files/file_pool/1/0P323311188327081841/1123%E5%A8%81%E7%A7%80.jpg',
        }
    };

    const getPosterForEvent = (item) => {
        const dateMap = posterMap[item.date];
        if (!dateMap) return summaryPoster;

        // 簡單關鍵字匹配
        for (const [key, url] of Object.entries(dateMap)) {
            if (item.location.includes(key)) {
                return url;
            }
        }
        return summaryPoster;
    };

    return realData.map((item, index) => {
        const posterUrl = getPosterForEvent(item);
        return {
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
                image: posterUrl // 贈品圖直接用海報
            },
            posterUrl: posterUrl,
            sourceUrl: posterUrl, // 點擊海報直接看大圖
            tags: ['自動更新', '最新活動', '海報辨識']
        };
    });
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
