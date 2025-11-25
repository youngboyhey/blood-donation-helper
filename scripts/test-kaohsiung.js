import puppeteer from 'puppeteer';

async function testKaohsiung() {
    const query = 'site:instagram.com/khblood_tbsf 捐血活動';
    console.log(`[Test] Searching for: ${query}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=qdr:w`;
        console.log(`[Test] URL: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        try {
            await page.waitForSelector('div[data-id] img', { timeout: 10000 });
            const thumbnails = await page.$$('div[data-id] img');
            console.log(`[Test] Found ${thumbnails.length} thumbnails.`);
        } catch (e) {
            console.log(`[Test] Timeout waiting for results. Checking page content...`);
            const content = await page.content();
            if (content.includes('找不到符合搜尋字詞')) {
                console.log('[Test] Google says: No results found.');
            } else {
                console.log('[Test] Unknown error or different layout.');
            }
        }

    } catch (error) {
        console.error('[Test] Error:', error);
    } finally {
        await browser.close();
    }
}

testKaohsiung();
