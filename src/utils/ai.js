import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. 取得 API Key (支援多組 Key，以逗號分隔)
const API_KEYS_STR = import.meta.env.VITE_GEMINI_API_KEY || "";
const API_KEYS = API_KEYS_STR.split(',').map(k => k.trim()).filter(k => k);

// 2. 定義模型優先順序 (排除 1.5)
const MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash"
];

// 3. 輔助函式：取得指定輪替的 Key 與 Model
const getModel = (retryCount) => {
    if (API_KEYS.length === 0) {
        throw new Error("Missing VITE_GEMINI_API_KEY");
    }

    // 計算當前應該使用的 Key 和 Model index
    // 邏輯：先輪替完所有 Key 的第一個 Model，再輪替所有 Key 的第二個 Model...
    const totalKeys = API_KEYS.length;
    const modelIndex = Math.floor(retryCount / totalKeys) % MODELS.length;
    const keyIndex = retryCount % totalKeys;

    const key = API_KEYS[keyIndex];
    const modelName = MODELS[modelIndex];

    const genAI = new GoogleGenerativeAI(key);
    return {
        model: genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" }
        }),
        keyMasked: key.substring(0, 5) + '...',
        modelName: modelName
    };
};

export async function analyzeImage(imageUrl) {
    if (API_KEYS.length === 0) {
        console.error("No API Keys found!");
        return [];
    }

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
    const maxRetries = API_KEYS.length * MODELS.length * 2; // Allow 2 full cycles
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            const { model, keyMasked, modelName } = getModel(retryCount);
            if (retryCount > 0) {
                console.log(`[AI Retry] Attempt ${retryCount}: Using Key ${keyMasked} with Model ${modelName}`);
            }

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: "image/jpeg"
                    }
                }
            ]);

            const response = await result.response;
            const text = response.text();

            // Basic cleaning of JSON string
            const jsonStr = text.replace(/```json/gi, '').replace(/```/g, '').trim();

            if (jsonStr === 'null' || jsonStr === '[]') return [];

            try {
                const parsed = JSON.parse(jsonStr);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                console.error("AI Parse Error:", text);
                // Parsing error might be model hallucination, try next model? 
                // Mostly usually better to just fail or retry. Let's retry.
                throw new Error("JSON Parse Error");
            }

        } catch (error) {
            const isQuotaError = error.message.includes('429') ||
                error.message.includes('Resource has been exhausted') ||
                error.message.includes('Quota exceeded');

            if (isQuotaError) {
                console.warn(`[AI] Quota/Rate limit hit (${error.message}). Switching...`);
                retryCount++;
                await new Promise(r => setTimeout(r, 1000)); // Brief pause
                continue;
            }

            // If it's a parsing error or other error, we also retry up to the limit
            console.warn(`[AI] Error: ${error.message}. Retrying...`);
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }
    }

    console.error("All AI attempts failed.");
    return [];
}
