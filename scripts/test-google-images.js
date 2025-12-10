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
            await page.waitForSelector('div[data-id] img, div.F0uyec', { timeout: 10000 });
        } catch (e) {
            console.log(`[Test] Timeout waiting for results.`);
            return;
        }

        // Create a robust loop using indices instead of element handles
        const thumbnailCount = await page.$$eval('div[data-id] img, div.F0uyec', imgs => imgs.length);
        console.log(`[Test] Found ${thumbnailCount} thumbnails.`);

        const MAX_RESULTS = 5;
        for (let i = 0; i < Math.min(thumbnailCount, MAX_RESULTS); i++) {
            console.log(`\n--- Processing #${i} ---`);

            // 1. Get Thumb Src & Click (Combined to avoid stale handles)
            let clickSuccess = false;
            let thumbSrc = null;

            try {
                const result = await page.evaluate((index) => {
                    const els = document.querySelectorAll('div[data-id] img, div.F0uyec');
                    const el = els[index];
                    if (!el) return { success: false };

                    const src = el.src || el.querySelector('img')?.src;
                    el.click();
                    return { success: true, src };
                }, i);

                clickSuccess = result.success;
                thumbSrc = result.src;
                if (clickSuccess) console.log(`[Debug] Click success`);
                else console.log(`[Debug] Click failed (element not found)`);

            } catch (e) {
                console.log(`[Debug] Interaction failed: ${e.message}`);
            }

            let result = { highResUrl: null, visitUrl: null };

            if (clickSuccess) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    // Extract Google High Res URL & Visit URL
                    const googleData = await page.evaluate(() => {
                        // High Res Image Candidate in Preview
                        const allImages = Array.from(document.querySelectorAll('img')).filter(img => img.src.startsWith('http') && !img.src.includes('gstatic.com') && !img.src.includes('favicon'));
                        allImages.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
                        const highResUrl = allImages.length > 0 ? allImages[0].src : null;

                        // Visit URL (Source Link)
                        // Verified selector: a.EZAeBe
                        const visitLink = document.querySelector('a.EZAeBe');
                        const visitUrl = visitLink ? visitLink.href : null;

                        return { highResUrl, visitUrl };
                    });

                    result.highResUrl = googleData.highResUrl;
                    result.visitUrl = googleData.visitUrl;

                    console.log(`[Google] Preview Image: ${result.highResUrl ? result.highResUrl.slice(0, 50) + '...' : 'Null'}`);
                    console.log(`[Google] Source URL: ${result.visitUrl}`);

                    // --- DEEP FETCH START ---
                    if (result.visitUrl) {
                        console.log(`[DeepFetch] Visiting source: ${result.visitUrl}`);
                        const newPage = await browser.newPage();
                        await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                        await newPage.setViewport({ width: 1920, height: 1080 });

                        try {
                            // Fast timeout for testing
                            await newPage.goto(result.visitUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                            await new Promise(r => setTimeout(r, 2000)); // Wait for render

                            // Extract Largest Image from Source
                            const sourceImage = await newPage.evaluate(() => {
                                const images = Array.from(document.querySelectorAll('img'));
                                const validImages = images.filter(img => {
                                    const rect = img.getBoundingClientRect();
                                    // Must be reasonably large
                                    return rect.width > 300 && rect.height > 300 && img.src.startsWith('http');
                                });

                                if (validImages.length === 0) return null;

                                // Sort by area
                                validImages.sort((a, b) => {
                                    const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                                    const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                                    return areaB - areaA;
                                });

                                return validImages[0].src;
                            });

                            if (sourceImage) {
                                console.log(`[DeepFetch] ✓ Found Source Image: ${sourceImage.slice(0, 50)}...`);
                                console.log(`[DeepFetch] URL Length: ${sourceImage.length}`);
                            } else {
                                console.log(`[DeepFetch] No suitable image found on page.`);
                            }

                        } catch (e) {
                            console.log(`[DeepFetch] Failed to load/scrape source: ${e.message}`);
                        } finally {
                            await newPage.close();
                        }
                    } else {
                        console.log(`[DeepFetch] Skipped (No source URL found)`);
                    }
                    // --- DEEP FETCH END ---

                } catch (e) {
                    console.log(`[Debug] Extraction failed: ${e.message}`);
                }
            }
        }

    } catch (error) {
        console.error('[Test] Error:', error);
    } finally {
        await browser.close();
    }
}

testGoogleImages();
