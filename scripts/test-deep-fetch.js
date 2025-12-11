import puppeteer from 'puppeteer';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

// 載入 Cookies
async function loadCookies() {
    if (process.env.COOKIES_JSON) {
        try { return JSON.parse(process.env.COOKIES_JSON); } catch (e) { }
    }
    if (fs.existsSync('cookies.json')) {
        try { return JSON.parse(fs.readFileSync('cookies.json', 'utf8')); } catch (e) { }
    }
    return [];
}

async function testDeepFetch() {
    const testUrl = 'https://www.instagram.com/p/DSByoLTk3iy/';
    console.log(`[Test] 測試 Deep Fetch: ${testUrl}`);

    const cookies = await loadCookies();
    console.log(`[Test] 載入 ${cookies.length} 個 cookies`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 設定 Instagram Cookies
        if (cookies.length > 0) {
            const instagramCookies = cookies.filter(c =>
                c.domain && (c.domain.includes('instagram.com') || c.domain.includes('.instagram.com'))
            );
            if (instagramCookies.length > 0) {
                await page.setCookie(...instagramCookies);
                console.log(`[Test] 已載入 ${instagramCookies.length} 個 Instagram cookies`);
            }
        }

        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));

        // 提取 og:image
        const ogImage = await page.evaluate(() => {
            const meta = document.querySelector('meta[property="og:image"]');
            return meta ? meta.getAttribute('content') : null;
        });

        if (ogImage) {
            console.log(`[Test] ✓ 成功取得 og:image:`);
            console.log(`       ${ogImage}`);

            // 驗證圖片是否可下載
            const response = await fetch(ogImage, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            console.log(`[Test] 圖片下載狀態: ${response.status}`);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                console.log(`[Test] ✓ 圖片大小: ${buffer.byteLength} bytes`);
            }
        } else {
            console.log(`[Test] ✗ 無法取得 og:image`);

            // 備用：嘗試取得最大圖片
            const largestImg = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                let best = null;
                let maxArea = 0;
                for (const img of imgs) {
                    const area = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
                    if (area > maxArea && img.src && img.src.startsWith('http')) {
                        maxArea = area;
                        best = img.src;
                    }
                }
                return best;
            });

            if (largestImg) {
                console.log(`[Test] 備用 - 最大圖片: ${largestImg.slice(0, 80)}...`);
            }
        }

    } catch (e) {
        console.error(`[Test] 錯誤: ${e.message}`);
    } finally {
        await browser.close();
    }
}

testDeepFetch().catch(console.error);
