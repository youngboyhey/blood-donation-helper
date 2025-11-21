title: `[AI辨識] ${eventData.location} 捐血活動`,
    date: eventData.date,
        time: eventData.time,
            location: eventData.location,
                organizer: '台北捐血中心',
                    gift: {
    name: eventData.gift,
        value: 300, // 預設值
            quantity: '依現場為主',
                image: imgUrl
},
posterUrl: imgUrl,
    sourceUrl: detailPageUrl,
        tags: ['AI辨識', '自動更新', 'Gemini']
                });
            }
        }

if (newEvents.length > 0) {
    const outputPath = path.join(__dirname, '../src/data/events.json');
    fs.writeFileSync(outputPath, JSON.stringify(newEvents, null, 2));
    console.log(`成功更新 ${newEvents.length} 筆活動資料！`);
} else {
    console.log('未提取到任何有效活動資料。');
}

    } catch (error) {
    console.error('更新失敗:', error);
    process.exit(1);
}
};

updateEvents();
