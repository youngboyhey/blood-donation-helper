'use client';

import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 取得 API Key (支援多組 Key，以逗號分隔)
const API_KEYS_STR = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const API_KEYS = API_KEYS_STR.split(',').map(k => k.trim()).filter(k => k);

const MODELS = ["gemini-2.5-flash"];

const getModelWithKeys = (retryCount, keys) => {
    if (keys.length === 0) throw new Error("Missing API key");
    const totalModels = MODELS.length;
    const keyIndex = Math.floor(retryCount / totalModels) % keys.length;
    const modelIndex = retryCount % totalModels;
    const key = keys[keyIndex];
    const modelName = MODELS[modelIndex];
    const genAI = new GoogleGenerativeAI(key);
    const gen = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
    });
    const keyMasked = key.substring(0, 5) + '...';
    const desc = `Key ${keyMasked} with Model ${modelName}`;
    return { gen, desc };
};

export async function analyzeImage(imageUrl, onStatus = () => { }, customApiKey = null) {
    const keysToUse = customApiKey ? [customApiKey] : API_KEYS;

    if (keysToUse.length === 0) {
        throw new Error("Missing NEXT_PUBLIC_GEMINI_API_KEY or custom API key");
    }

    onStatus("準備下載圖片...");
    let base64Data;
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
        });
    } catch (e) {
        console.error("Failed to download image for analysis:", e);
        return [];
    }

    const today = new Date().toISOString().split('T')[0];
    const prompt = `請分析這張圖片，判斷是否為「單一場次」的捐血活動海報。
今天是 ${today}。

【台灣縣市清單 - city 欄位只能填以下 22 個縣市之一】
台北市、新北市、桃園市、台中市、台南市、高雄市、
基隆市、新竹市、新竹縣、苗栗縣、彰化縣、南投縣、
雲林縣、嘉義市、嘉義縣、屏東縣、宜蘭縣、花蓮縣、
台東縣、澎湖縣、金門縣、連江縣

⚠️ 注意：
- 「新竹」不是有效縣市，必須明確填寫「新竹市」或「新竹縣」
- 「嘉義」不是有效縣市，必須明確填寫「嘉義市」或「嘉義縣」
- city 欄位必須是上述 22 個縣市之一，不可填寫其他值

【嚴格過濾規則 - 必須全部符合才算有效】
1. **總表/列表檢查**：若圖片是活動總表、行事曆、場次表，視為 INVALID
2. **地點檢查**：必須有具體的活動地點名稱
3. **日期檢查**：必須有明確的單一日期，且為未來日期（晚於 ${today}）
   ⚠️ **民國年轉換**：如「114年」= 2025年（114 + 1911 = 2025）

若不符合以上任一規則，請回傳：
{ "valid": false, "reason": "具體原因" }

請以 JSON 格式回傳：
{
  "valid": true/false,
  "reason": "若無效則說明原因",
  "title": "活動標題",
  "date": "YYYY-MM-DD",
  "time": "HH:MM-HH:MM",
  "location": "地點名稱",
  "city": "縣市（必須是22縣市之一）",
  "district": "行政區",
  "organizer": "主辦單位",
  "gift": "贈品資訊字串或null"
}`;

    const maxRetries = keysToUse.length * MODELS.length * 2;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const { gen, desc } = getModelWithKeys(retryCount, keysToUse);
        const msg = `AI 分析中... (${desc})`;
        console.log(msg);
        onStatus(msg);

        try {
            const result = await gen.generateContent([
                prompt,
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]);
            let jsonStr = result.response.text();
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            if (jsonStr === 'null') return [];
            const parsed = JSON.parse(jsonStr);

            if (parsed.valid === false) {
                console.log(`[AI] 無效活動: ${parsed.reason}`);
                return [];
            }

            if (!parsed.title || !parsed.date || !parsed.location) {
                console.log(`[AI] 缺少必要欄位`);
                return [];
            }

            const VALID_CITIES = [
                '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
                '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
                '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
                '台東縣', '澎湖縣', '金門縣', '連江縣'
            ];

            if (parsed.city && !VALID_CITIES.includes(parsed.city)) {
                const fuzzyMap = {
                    '台北': '台北市', '新北': '新北市', '桃園': '桃園市',
                    '台中': '台中市', '台南': '台南市', '高雄': '高雄市',
                    '基隆': '基隆市', '新竹': '新竹市', '嘉義': '嘉義市'
                };
                for (const [key, val] of Object.entries(fuzzyMap)) {
                    if (parsed.city.includes(key)) {
                        console.log(`[AI] 修正縣市: ${parsed.city} -> ${val}`);
                        parsed.city = val;
                        break;
                    }
                }
            }

            return Array.isArray(parsed) ? parsed : [parsed];

        } catch (error) {
            const isRateLimit = error.message.includes('429') || error.message.includes('Resource has been exhausted');
            if (isRateLimit) {
                console.warn(`[AI] Rate limit hit (${desc}), switching key...`);
            } else {
                console.error("AI Analysis Error:", error);
            }
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    throw new Error("AI Service Unavailable (All keys exhausted)");
}
