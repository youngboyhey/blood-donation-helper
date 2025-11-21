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
