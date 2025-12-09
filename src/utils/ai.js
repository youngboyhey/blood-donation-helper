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

嚴格區分與過濾規則：
1. **日期精確性 (關鍵)**：
   - **多日期處理**：若海報包含多個日期 (例如 "12/1, 12/8, 12/15" 或 "12月1、8、15日")，**務必** 為每一個日期產生一個獨立的 JSON 物件。**絕對不要** 只回傳第一個日期。
   - 必須包含明確的「年份」或「日期」。
   - 若海報上只有 "12/25" 且無年份，請根據今天 (${today}) 判斷：若已過期假設明年，否則假設今年。
   - 若海報是「每週五」、「每月1號」等週期性活動，請 **回傳 null** (本系統暫不支援週期性活動)。
   - 若海報是「113年」或「114年」請自動轉換為西元 2024 或 2025。

2. **地點精確性 (嚴格禁止幻覺)**：
   - **絕對禁止** 猜測或補完地址。只提取海報上 **明確可見** 的地點資訊。
   - 若海報只寫「愛國超市前」，就填「愛國超市前」。
   - 若地點是 "全台各地", "各捐血室", "詳見官網" 等模糊地點，請 **回傳 null**。
   - 若海報是多個場次的列表 (例如 "1月場次表")，請 **回傳 null** (本系統只處理單一或少數特定場次)。

3. **內容相關性**：
   - 必須是「捐血活動」。
   - 若是「捐血榮譽榜」、「缺血公告」、「新聞稿」、「衛教資訊」，請 **回傳 null**。

請輸出 JSON 陣列，欄位如下：
[
  {
    "title": "活動標題 (請包含地點與關鍵特色)",
    "date": "YYYY-MM-DD",
    "time": "HH:MM-HH:MM",
    "location": "地點名稱",
    "city": "縣市 (請從地點判斷，如無法判斷請填 null)",
    "district": "行政區 (請從地點判斷，如無法判斷請填 null)",
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
