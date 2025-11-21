fs.writeFileSync(outputPath, JSON.stringify(newEvents, null, 2));
console.log(`成功更新 ${newEvents.length} 筆活動資料！`);
        } else {
    const prompt = `請分析這張捐血活動海報。
嚴格區分：這張圖片是「單一活動海報」還是「多地點總表」？

1. 如果是「多地點總表」(包含多個不同地點、列表形式、密密麻麻的文字)，請直接回傳 null。絕對不要提取總表的資料，因為缺乏贈品細節。
2. 只有當圖片是針對「單一特定地點」或「單一特定活動」的宣傳海報，且包含具體的「贈品資訊」(例如：送全聯禮券、紀念傘、電影票等) 時，才提取資料。

若符合第 2 點，請提取以下資訊為 JSON 格式：
- date (日期，格式 YYYY-MM-DD，若海報只有寫 11/23 請自動補上年份 2025)
- time (時間，例如 09:00-17:00)
- location (地點名稱，請完整提取，例如 "忠孝號 (東區地下街9號出口)")
- gift (贈品內容，請詳細描述，例如 "環保購物袋+飲料提袋")

請只回傳 JSON 字串，不要有 markdown 標記。`;
}

    } catch (error) {
    console.error('更新失敗:', error);
    process.exit(1);
}
};

updateEvents();
