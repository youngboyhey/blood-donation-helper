import puppeteer from 'puppeteer';
import 'dotenv/config';

const TARGET_URL = 'https://www.facebook.com/photo.php?fbid=1240316181458573&set=pb.100064406090850.-2207520000&type=3';

async function debugFacebookImage() {
    console.log(`[Debug] Testing URL: ${TARGET_URL}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
    });

    const c_user = process.env.FB_COOKIE_C_USER;
    const xs = process.env.FB_COOKIE_XS;

    // 1. Test WWW with new logic (Explicit Wait)
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Enable console log forwarding
        page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

        if (c_user && xs) {
            await page.setCookie(
                { name: 'c_user', value: c_user, domain: '.facebook.com' },
                { name: 'xs', value: xs, domain: '.facebook.com' }
            );
        }

        console.log('[Debug] WWW: Navigating...');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('[Debug] WWW: Waiting 5 seconds explicitly...');
        await new Promise(r => setTimeout(r, 5000)); // Increased to 5s for debug

        const imgUrl = await page.evaluate(() => {
            const isInvalid = (src) => {
                return !src ||
                    src.includes('static.xx.fbcdn.net') ||
                    src.includes('rsrc.php') ||
                    src.includes('emoji') ||
                    src.includes('icon') ||
                    src.includes('data:image') ||
                    src.endsWith('.svg');
            };

            // 1. Meta Tags
            const metaImg = document.querySelector('meta[property="og:image"]');
            if (metaImg) {
                console.log(`[Evaluate] Found og:image: ${metaImg.content}`);
                if (!isInvalid(metaImg.content)) return metaImg.content;
            }

            // 2. Largest Image
            const images = Array.from(document.querySelectorAll('img'));
            console.log(`[Evaluate] Found ${images.length} images`);

            let maxArea = 0;
            let bestImg = null;
            images.forEach((img, i) => {
                if (isInvalid(img.src)) return;
                const area = img.naturalWidth * img.naturalHeight;
                console.log(`[Evaluate] Image ${i}: ${area}px, src: ${img.src.substring(0, 50)}...`);

                if (area > 2000 && area > maxArea) {
                    maxArea = area;
                    bestImg = img.src;
                }
            });
            return bestImg;
        });
        console.log(`[Debug] WWW Result: ${imgUrl}`);
        await page.close();
    } catch (e) {
        console.error('[Debug] WWW Failed:', e);
    }

    await browser.close();
}

debugFacebookImage();
