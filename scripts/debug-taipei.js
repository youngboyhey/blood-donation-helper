import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function debugTaipei() {
    const url = 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284';
    console.log(`[Debug] Fetching: ${url}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const content = await page.content();
        const $ = cheerio.load(content);

        console.log('[Debug] Links found:');
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            if (text && href) {
                console.log(`- Text: "${text}", Href: "${href}"`);
            }
        });

    } catch (error) {
        console.error('[Debug] Error:', error);
    } finally {
        await browser.close();
    }
}

debugTaipei();
