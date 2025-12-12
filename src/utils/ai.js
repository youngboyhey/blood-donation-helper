import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 取得 API Key (支援多組 Key，以逗號分隔)
const API_KEYS_STR = import.meta.env.VITE_GEMINI_API_KEY || "";
const API_KEYS = API_KEYS_STR.split(',').map(k => k.trim()).filter(k => k);

// 2. 定義模型 - 使用付費版 Gemini 2.0 Flash
const MODELS = ["gemini-2.0-flash"];

// 3. 輔助函式：取得指定輪替的 Key 與 Model
const getModelWithKeys = (retryCount, keys) => {
    if (keys.length === 0) {
        throw new Error("Missing API key");
    }

    // 計算當前應該使用的 Key 和 Model index
    // 邏輯：每把 KEY 都會嘗試過所有 MODELS 後，才切換到下一把 KEY
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
    // If custom API key is provided, use it exclusively
    const keysToUse = customApiKey ? [customApiKey] : API_KEYS;

    if (keysToUse.length === 0) {
        throw new Error("Missing VITE_GEMINI_API_KEY or custom API key");
    }

    onStatus("準備下載圖片...");
    // Fetch the image to get base64
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

【常見地標對應縣市 - 請依此判斷正確縣市】
- 藝文特區、中壢、八德、平鎮、楊梅、龍潭 → 桃園市
- 信義區、大安區、中正區、松山區、內湖區 → 台北市
- 板橋、三重、新莊、中和、永和、土城 → 新北市
- 竹北、竹東、湖口、新豐 → 新竹縣
- 東區、北區、香山區 → 新竹市
- 豐原、大里、太平、沙鹿、清水 → 台中市
- 鳳山、左營、前鎮、三民、楠梓、岡山 → 高雄市

【嚴格過濾規則 - 必須全部符合才算有效】

1. **總表/列表檢查 (最重要)**：
   - 若圖片是「活動總表」、「行事曆」、「場次表」、「巡迴表」，視為 **INVALID**。
   - 若圖片中包含 **多個不同地點** 或 **多個不同日期** 的活動列表，視為 **INVALID**。
   - 若圖片呈現表格形式，列出多個活動資訊，視為 **INVALID**。
   - **我只需要「單一場次」的活動海報，不要總表！**

2. **地點檢查 (重要！)**：
   - 必須有具體的活動地點名稱（如「XXX公園」、「XXX大樓」、「XXX路XX號」、「XXX捐血亭」）。
   - **至少要有縣市或行政區其中一個**。
   - ⚠️ **「XX捐血中心」是發布來源，不是活動地點！** 請忽略「新竹捐血中心」、「台北捐血中心」等字樣，從海報內容中找出實際活動地點。
   - 若僅有模糊地點（如「嘉義」、「南部」）而無具體地點，視為 **INVALID**。

3. **日期檢查 (重要！)**：
   - 必須有明確的單一日期，且為未來日期（晚於 ${today}）。
   - 若是日期區間（如 12/1~12/31），視為 **INVALID**。
   - ⚠️ **民國年轉換**：台灣常用民國紀年，如「114年12月13日」。
     - 民國年 + 1911 = 西元年
     - 114 + 1911 = **2025** (不是 2114 或 2125！)
     - 113 + 1911 = 2024
     - 請務必正確轉換後再填入 date 欄位

若不符合以上任一規則，請回傳：
{ "valid": false, "reason": "具體原因" }

【資訊提取】（僅在有效時填寫）
- **title**: 活動標題
- **date**: YYYY-MM-DD 格式 (西元年，如 2025-12-13)
- **time**: HH:MM-HH:MM 格式
- **location**: 具體地點名稱（如「藝文特區同德六街捐血亭」，不含縣市前綴）
- **city**: 必須是上述 22 縣市之一（如「桃園市」、「新竹市」）
- **district**: 行政區（如「八德區」、「中正區」、「竹北市」）
- **organizer**: 主辦單位
- **gift**: 贈品資訊字串。若有 250cc/500cc 差異請完整列出。若無具體贈品填 null。

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
}
`;

    // Retry Loop
    const maxRetries = keysToUse.length * MODELS.length * 2; // Allow 2 full cycles
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const { gen, desc } = getModelWithKeys(retryCount, keysToUse);
        const msg = `AI 分析中... (${desc})`;
        console.log(msg);
        onStatus(msg);

        try {
            const result = await gen.generateContent([
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: "image/jpeg"
                    }
                }
            ]);
            let jsonStr = result.response.text();

            // Clean markdown JSON
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

            if (jsonStr === 'null') return [];

            const parsed = JSON.parse(jsonStr);

            // 處理新格式：檢查 valid 欄位
            if (parsed.valid === false) {
                console.log(`[AI] 無效活動: ${parsed.reason}`);
                return [];
            }

            // 驗證必要欄位
            if (!parsed.title || !parsed.date || !parsed.location) {
                console.log(`[AI] 缺少必要欄位`);
                return [];
            }

            // 驗證縣市（必須是有效的 22 縣市之一）
            const VALID_CITIES = [
                '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
                '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
                '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
                '台東縣', '澎湖縣', '金門縣', '連江縣'
            ];

            if (parsed.city && !VALID_CITIES.includes(parsed.city)) {
                // 嘗試模糊修正
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
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit before retry
            } else {
                console.error("AI Analysis Error:", error);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    throw new Error("AI Service Unavailable (All keys exhausted)");
}
