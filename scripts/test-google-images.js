import puppeteer from 'puppeteer';

async function testFetchGoogleImages() {
    const query = '台中捐血中心 捐血活動 贈品';
    console.log(`[Test] Searching for: ${query}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=qdr:w`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Wait for results
        await page.waitForSelector('div[data-id] img', { timeout: 10000 });

        const highResImages = [];

        // Try the first 5 results
        for (let i = 0; i < 5; i++) {
            try {
                console.log(`[Test] Processing result ${i + 1}...`);

                // Re-query thumbnails every time to avoid stale handles
                const thumbnails = await page.$$('div[data-id] img');
                if (i >= thumbnails.length) break;

                const thumb = thumbnails[i];
                await thumb.click();

                // Wait for the side panel / preview to load
                await new Promise(r => setTimeout(r, 3000));

                const result = await page.evaluate(() => {
                    const allImages = Array.from(document.querySelectorAll('img'));

                    // Debug: return info about potential candidates
                    const candidates = allImages.map(img => {
                        const rect = img.getBoundingClientRect();
                        return {
                            src: img.src,
                            width: rect.width,
                            height: rect.height,
                            top: rect.top,
                            left: rect.left
                        };
                    });

                    // Filter for "preview" images
                    const validCandidates = candidates.filter(c => {
                        const isVisible = c.width > 0 && c.height > 0;
                        const isLarge = c.width > 200 && c.height > 200; // Relaxed size
                        const isHttp = c.src.startsWith('http') && !c.src.includes('gstatic.com');
                        return isVisible && isLarge && isHttp;
                    });

                    if (validCandidates.length > 0) {
                        // Sort by area descending
                        validCandidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                        return { found: true, src: validCandidates[0].src, count: validCandidates.length };
                    }

                    return { found: false, count: candidates.length, validCount: 0 };
                });

                if (result.found) {
                    console.log(`[Test] Found high-res: ${result.src}`);
                    highResImages.push(result.src);
                } else {
                    console.log(`[Test] No high-res found. Total imgs: ${result.count}, Valid: ${result.validCount}`);
                }

            } catch (e) {
                console.error(`[Test] Error on #${i + 1}:`, e.message);
            }
        }

        console.log('[Test] Final images:', highResImages);

    } catch (error) {
        console.error('[Test] Fatal Error:', error);
    } finally {
        await browser.close();
    }
}

testFetchGoogleImages();
