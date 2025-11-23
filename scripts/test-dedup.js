
const normalize = (str) => (str || '').replace(/[()\s\-\uff08\uff09]/g, '').toLowerCase();

const events = [
    {
        title: "11月23日捐血地點 歡迎大家假日來捐血",
        date: "2025-11-23",
        location: "柏昶新世界",
        city: "桃園市",
        posterUrl: "url1"
    },
    {
        title: "捐一袋血，暖一顆心",
        date: "2025-11-23",
        location: "柏昶新世界(中壢區中山東路一段336號)",
        city: "桃園市",
        posterUrl: "url2"
    }
];

const uniqueEvents = [];

for (const evt of events) {
    const duplicateIndex = uniqueEvents.findIndex(existing => {
        if (existing.date !== evt.date) return false;
        if (existing.city && evt.city && existing.city !== evt.city) return false;

        const loc1 = normalize(existing.location);
        const loc2 = normalize(evt.location);

        console.log(`Comparing: '${loc1}' vs '${loc2}'`);
        const match = loc1.includes(loc2) || loc2.includes(loc1);
        console.log(`Match: ${match}`);
        return match;
    });

    if (duplicateIndex !== -1) {
        console.log("Duplicate found!");
        const existing = uniqueEvents[duplicateIndex];
        // Merge logic
        let keepNew = false;
        if (evt.posterUrl && !existing.posterUrl) keepNew = true;
        else if (!evt.posterUrl && existing.posterUrl) keepNew = false;
        else {
            if ((evt.location || '').length > (existing.location || '').length) keepNew = true;
        }

        if (keepNew) {
            uniqueEvents[duplicateIndex] = evt;
            console.log("Replaced existing with new.");
        } else {
            console.log("Kept existing.");
        }
    } else {
        uniqueEvents.push(evt);
        console.log("Added new event.");
    }
}

console.log("Final unique events:", uniqueEvents);
