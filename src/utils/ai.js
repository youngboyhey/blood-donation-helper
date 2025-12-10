import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 取得 API Key (支援多組 Key，以逗號分隔)
const API_KEYS_STR = import.meta.env.VITE_GEMINI_API_KEY || "";
const API_KEYS = API_KEYS_STR.split(',').map(k => k.trim()).filter(k => k);

// 2. 定義模型優先順序 (排除 1.5)
// 2. 定義模型優先順序
const MODELS = [
    "gemini-2.5-pro",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-lite-preview-09-2025",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
];

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
    const prompt = `請分析這張捐血活動海報。
今天是 ${today}。

【嚴格過濾規則 - 重要】
若海報缺少以下任一關鍵資訊，請直接回傳 null (與其給錯誤資訊，不如不要)：
1. **日期** (必須明確)
2. **地點** (必須明確)
**修正規則**：
- 必須要有「日期」與「地點」。
- 若無年份，依今日(${today})推算。
- 若已過期，請回傳 null。
- 若圖片尺寸極小或模糊無法辨識，回傳 null。
- 若是「每週」或「每月」例行性文字，回傳 null。

【地點解析特別指示】
請將地點精確拆分為:
- **city (縣市)**: 例如 "南投縣", "台中市"。若海報寫 "南投市XXX"，City 應為 "南投縣"，District 為 "南投市"。請務必辨識台灣行政區階層。
- **district (行政區)**: 例如 "中寮鄉", "北區"。
- **location**: 完整地點名稱。

請輸出 JSON 陣列，欄位如下：
[
  {
    "title": "活動標題 (請包含地點與關鍵特色)",
    "date": "YYYY-MM-DD",
    "time": "HH:MM-HH:MM",
    "location": "地點名稱",
    "city": "縣市",
    "district": "行政區",
    "organizer": "主辦單位",
    "gift": { "name": "贈品名稱 (若無實質贈品填 null)", "image": null },
    "tags": ["AI辨識"]
  }
]
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
            const jsonStr = result.response.text();

            if (jsonStr === 'null') return [];

            const parsed = JSON.parse(jsonStr);
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
