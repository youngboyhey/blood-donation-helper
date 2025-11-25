import puppeteer from 'puppeteer';

async function testGoogleImages() {
    const query = '高雄捐血中心 捐血活動 贈品';
    console.log(`[Test] Searching for: ${query}`);

    const browser = await puppeteer.launch({
        headless: false, // Run in headful mode to see what's happening
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
            console.log(`[Test] Timeout waiting for results`);
            return;
        }

        const thumbnails = await page.$$('div[data-id] img');
        console.log(`[Test] Found ${thumbnails.length} thumbnails`);

        // Test the first 5 results
        for (let i = 0; i < Math.min(5, thumbnails.length); i++) {
            console.log(`\n--- Result ${i + 1} ---`);

            // Re-query to avoid stale elements
            const currentThumbnails = await page.$$('div[data-id] img');
            const thumb = currentThumbnails[i];

            try {
                await page.evaluate(el => el.click(), thumb);
                await new Promise(r => setTimeout(r, 2000)); // Wait for side panel

                const result = await page.evaluate(() => {
                    // Helper to check if an image is likely an icon/logo
                    const isIcon = (img) => {
                        const src = img.src.toLowerCase();
                        return src.includes('icon') || src.includes('logo') || src.includes('fb') || src.includes('instagram');
                    };

                    // 1. Find the side panel container (usually on the right)
                    // Google's side panel often has a specific structure. 
                    // We look for the largest image that is NOT the thumbnail we just clicked.

                    const allImages = Array.from(document.querySelectorAll('img'));

                    const candidates = allImages.filter(img => {
                        const rect = img.getBoundingClientRect();
                        // Filter out small images (icons) and hidden images
                        if (rect.width < 200 || rect.height < 200) return false;
                        if (rect.width === 0 || rect.height === 0) return false;

                        // Must be http(s) to be useful for linking, but we accept base64 if it's high res
                        // However, for "linking" we prefer http.

                        // Filter out known icon patterns
                        if (isIcon(img)) return false;

                        return true;
                    });

                    // Sort by size (largest first) - The main image in side panel is usually the largest visible one
                    candidates.sort((a, b) => {
                        const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                        const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                        return areaB - areaA;
                    });

                    let highResUrl = null;
                    // Prefer the first candidate that starts with http
                    const httpCandidate = candidates.find(img => img.src.startsWith('http') && !img.src.includes('gstatic.com'));

                    if (httpCandidate) {
                        highResUrl = httpCandidate.src;
                    } else if (candidates.length > 0) {
                        // Fallback to base64 if it's the only large image found
                        highResUrl = candidates[0].src;
                    }

                    // 2. Find "Visit" link
                    // The visit link is usually near the main image in the side panel.
                    // We look for <a> tags with specific text or structure.
                    const links = Array.from(document.querySelectorAll('a'));
                    let visitUrl = null;

                    // Strategy 1: Text content
                    const visitLink = links.find(a => {
                        const text = a.innerText.trim();
                        const rect = a.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            (text.includes('前往') || text.includes('Visit') || text === '網站' || text === 'Website');
                    });

                    if (visitLink) {
                        visitUrl = visitLink.href;
                    } else {
                        // Strategy 2: Look for the link wrapping the image or immediately following it
                        // This is harder to generalize, so we stick to a fallback of "first external link in side panel"
                        // Assuming side panel is roughly the right half of the screen
                        const sidePanelLinks = links.filter(a => {
                            const rect = a.getBoundingClientRect();
                            return rect.left > window.innerWidth / 2 && // Right half
                                rect.width > 0 && rect.height > 0 &&
                                a.href.startsWith('http') &&
                                !a.href.includes('google.com');
                        });

                        if (sidePanelLinks.length > 0) {
                            visitUrl = sidePanelLinks[0].href;
                        }
                    }

                    return {
                        highResUrl,
                        visitUrl,
                        debugCandidates: candidates.slice(0, 3).map(img => ({
                            src: img.src.substring(0, 50) + '...',
                            width: img.getBoundingClientRect().width,
                            height: img.getBoundingClientRect().height
                        }))
                    };
                });

                console.log('High Res URL:', result.highResUrl);
                console.log('Visit URL:', result.visitUrl);
                console.log('Debug Candidates:', result.debugCandidates);
            } catch (e) {
                console.error(`[Test] Error processing result ${i}:`, e.message);
            }
        }
    } catch (error) {
        console.error('[Test] Error:', error);
    } finally {
        await browser.close();
    }
}

testGoogleImages();
