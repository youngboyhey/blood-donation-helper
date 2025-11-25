import puppeteer from 'puppeteer';

async function testGoogleImages() {
    const query = 'site:instagram.com 台中捐血中心 捐血活動';
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
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        try {
            await page.waitForSelector('div[data-id] img', { timeout: 10000 });
        } catch (e) {
            console.log(`[Test] Timeout waiting for results.`);
            return;
        }

        // Re-query thumbnails inside the loop to avoid stale elements (simulated here by just querying once but handling errors)
        // In the real script we re-query. Here we just want to test the logic on the first few items.
        const thumbnails = await page.$$('div[data-id] img');
        console.log(`[Test] Found ${thumbnails.length} thumbnails.`);

        const MAX_RESULTS = 5;
        for (let i = 0; i < Math.min(thumbnails.length, MAX_RESULTS); i++) {
            const thumb = thumbnails[i];
            console.log(`\n--- Processing #${i} ---`);

            // 1. Get Thumb Src
            let thumbSrc = null;
            try {
                thumbSrc = await page.evaluate(el => el.src, thumb);
                console.log(`[Debug] Thumb Src: ${thumbSrc ? thumbSrc.substring(0, 50) + '...' : 'null'} (Length: ${thumbSrc ? thumbSrc.length : 0})`);
            } catch (e) {
                console.log(`[Debug] Failed to get thumb src: ${e.message}`);
            }

            // 2. Click
            let clickSuccess = false;
            try {
                await page.evaluate(el => el.click(), thumb);
                clickSuccess = true;
                console.log(`[Debug] Click success`);
            } catch (e) {
                console.log(`[Debug] Click failed: ${e.message}`);
            }

            let result = { highResUrl: null, visitUrl: null };

            if (clickSuccess) {
                await new Promise(r => setTimeout(r, 1500));
                try {
                    result = await page.evaluate(() => {
                        const isIcon = (img) => {
                            const src = img.src.toLowerCase();
                            return src.includes('icon') || src.includes('logo') || src.includes('favicon');
                        };
                        const isPlaceholder = (img) => {
                            const src = img.src;
                            return src.includes('data:image/gif') || src.includes('R0lGODlhAQABA');
                        };

                        const allImages = Array.from(document.querySelectorAll('img'));
                        const candidates = allImages.filter(img => {
                            const rect = img.getBoundingClientRect();
                            if (rect.width < 150 || rect.height < 150) return false;
                            if (rect.width === 0 || rect.height === 0) return false;
                            if (isIcon(img)) return false;
                            if (isPlaceholder(img)) return false;
                            return true;
                        });
                        candidates.sort((a, b) => {
                            const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                            const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                            return areaB - areaA;
                        });
                        let highResUrl = null;
                        const httpCandidate = candidates.find(img => img.src.startsWith('http') && !img.src.includes('gstatic.com'));
                        if (httpCandidate) {
                            highResUrl = httpCandidate.src;
                        } else if (candidates.length > 0) {
                            highResUrl = candidates[0].src;
                        }

                        // Visit URL logic (simplified for test)
                        const links = Array.from(document.querySelectorAll('a'));
                        let visitUrl = null;
                        const visitLink = links.find(a => a.innerText.includes('前往') || a.innerText.includes('Visit'));
                        if (visitLink) visitUrl = visitLink.href;

                        return { highResUrl, visitUrl, candidateCount: candidates.length };
                    });
                    console.log(`[Debug] Extraction result: Candidates=${result.candidateCount}, HighRes=${result.highResUrl ? 'Found' : 'Null'}`);
                } catch (e) {
                    console.log(`[Debug] Extraction failed: ${e.message}`);
                }
            }

            let finalImageUrl = result.highResUrl;

            // Double check if highResUrl is a placeholder or too short
            if (finalImageUrl && (finalImageUrl.includes('data:image/gif') || finalImageUrl.length < 100)) {
                console.log(`[Debug] High res URL looks like a placeholder, falling back to thumbnail.`);
                finalImageUrl = null;
            }

            finalImageUrl = finalImageUrl || thumbSrc;

            if (finalImageUrl) {
                console.log(`[Debug] Final URL Length: ${finalImageUrl.length}`);
                if (finalImageUrl.length > 100) {
                    console.log(`[Result] ACCEPTED: ${finalImageUrl.substring(0, 50)}...`);
                } else {
                    console.log(`[Result] REJECTED (Too short): ${finalImageUrl.substring(0, 50)}...`);
                }
            } else {
                console.log(`[Result] REJECTED (Null)`);
            }
        }

    } catch (error) {
        console.error('[Test] Error:', error);
    } finally {
        await browser.close();
    }
}

testGoogleImages();
