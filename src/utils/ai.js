import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function analyzeImage(imageUrl) {
    if (!API_KEY) {
        throw new Error("Missing VITE_GEMINI_API_KEY");
    }

    // Fetch the image to get base64
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const base64Data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
    });

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash", // Use flash for speed
        generationConfig: { responseMimeType: "application/json" }
    });

    const today = new Date().toISOString().split('T')[0];

    const prompt = `請分析這張捐血活動海報。
今天是 ${today}。

嚴格規則：
1. **日期**：必須包含明確年份。若無年份，根據今天判斷 (若已過期假設明年)。
2. **地點**：不要瞎掰地址，只填海報上有的。
3. **區分**：若海報包含多個場次日期，請回傳所有場次的陣列。

請輸出 JSON 陣列，欄位如下：
[
  {
    "title": "活動標題",
    "date": "YYYY-MM-DD",
    "time": "HH:MM-HH:MM",
    "location": "地點名稱",
    "city": "縣市",
    "district": "行政區",
    "organizer": "主辦單位",
    "gift": { "name": "贈品名稱", "image": null },
    "tags": ["AI辨識"]
  }
]
`;

    const result = await model.generateContent([
        prompt,
        {
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
            }
        }
    ]);

    const text = result.response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("AI Parse Error:", text);
        return [];
    }
}
