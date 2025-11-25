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
        // Use the same URL structure as update-events.js (past week)
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=qdr:w`;
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        try {
            await page.waitForSelector('div[data-id] img', { timeout: 10000 });
        } catch (e) {
            console.log(`[Test] Timeout waiting for results.`);
            return;
        }

        const thumbnails = await page.$$('div[data-id] img');
        console.log(`[Test] Found ${thumbnails.length} thumbnails.`);

        const MAX_RESULTS = 10; // Test first 10
        for (let i = 0; i < Math.min(thumbnails.length, MAX_RESULTS); i++) {
            const thumb = thumbnails[i];

            // Scroll to thumbnail
            try {
                await page.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }), thumb);
                await new Promise(r => setTimeout(r, 500)); // Wait for scroll
            } catch (e) {
                console.log(`[Test] Scroll failed for #${i}`);
            }

            // Click thumbnail
            try {
                await page.evaluate(el => el.click(), thumb);
            } catch (e) {
                console.log(`[Test] Click failed for #${i}: ${e.message}`);
                continue;
            }

            await new Promise(r => setTimeout(r, 2000)); // Increased wait

            const result = await page.evaluate(() => {
                const isIcon = (img) => {
                    const src = img.src.toLowerCase();
                    // Only filter out obvious icon filenames
                    return src.includes('icon') || src.includes('logo') || src.includes('favicon');
                };

                const allImages = Array.from(document.querySelectorAll('img'));
                const debugCandidates = [];

                const candidates = allImages.filter(img => {
                    const rect = img.getBoundingClientRect();
                    const icon = isIcon(img);

                    // Log potential candidates for debugging
                    if (rect.width > 50 && rect.height > 50) {
                        debugCandidates.push({
                            src: img.src.substring(0, 50) + '...',
                            width: rect.width,
                            height: rect.height,
                            isIcon: icon
                        });
                    }

                    // Relaxed size filter
                    if (rect.width < 150 || rect.height < 150) return false;
                    if (rect.width === 0 || rect.height === 0) return false;
                    if (icon) return false;
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

                const links = Array.from(document.querySelectorAll('a'));
                let visitUrl = null;
                const visitLink = links.find(a => {
                    const text = a.innerText.trim();
                    const rect = a.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 &&
                        (text.includes('前往') || text.includes('Visit') || text === '網站' || text === 'Website');
                });

                if (visitLink) {
                    visitUrl = visitLink.href;
                } else {
                    const sidePanelLinks = links.filter(a => {
                        const rect = a.getBoundingClientRect();
                        return rect.left > window.innerWidth / 2 &&
                            rect.width > 0 && rect.height > 0 &&
                            a.href.startsWith('http') &&
                            !a.href.includes('google.com');
                    });
                    if (sidePanelLinks.length > 0) {
                        visitUrl = sidePanelLinks[0].href;
                    }
                }

                return { highResUrl, visitUrl, candidateCount: candidates.length, debugCandidates };
            });

            console.log(`--- Result ${i} ---`);
            console.log(`High Res URL: ${result.highResUrl ? result.highResUrl.substring(0, 50) + '...' : 'null'}`);
            console.log(`Visit URL: ${result.visitUrl}`);
            console.log(`Candidates: ${result.candidateCount}`);
            // console.log(`Debug Candidates:`, JSON.stringify(result.debugCandidates, null, 2));
        }

    } catch (error) {
        console.error('[Test] Error:', error);
    } finally {
        await browser.close();
    }
}

testGoogleImages();
