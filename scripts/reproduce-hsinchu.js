import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

const source = {
    type: 'web',
    id: 'hsinchu',
    name: '新竹捐血中心',
    url: 'https://www.sc.blood.org.tw/xmdoc?xsmsid=0P066666699492479492',
    baseUrl: 'https://www.sc.blood.org.tw',
    city: '新竹市'
};

async function fetchHTMLWithPuppeteer(url) {
    console.log(`[Puppeteer] Launching browser to fetch: ${url}`);
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const content = await page.content();
        await browser.close();
        return content;
    } catch (error) {
        console.error(`[Puppeteer] 抓取失敗 ${url}:`, error);
        await browser.close();
        throw error;
    }
}

async function debugHsinchu() {
    console.log(`[Web] 正在抓取官網: ${source.name} (${source.url})`);
    try {
        const html = await fetchHTMLWithPuppeteer(source.url);
        const $ = cheerio.load(html);

        const links = $('a');
        console.log(`Found ${links.length} total links.`);

        let targetLink = null;

        links.each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');

            if (text.includes('捐血活動')) {
                console.log(`[Candidate] Found link: "${text}" -> ${href}`);

                if (!text.includes('怎麼辦') &&
                    !text.includes('暫停') &&
                    !text.includes('新聞稿')) {

                    if (!targetLink) {
                        targetLink = $(el);
                        console.log(`[Selected] This is the FIRST match, will be used.`);
                    } else {
                        console.log(`[Ignored] This is a subsequent match, currently ignored by logic.`);
                    }
                } else {
                    console.log(`[Filtered] Filtered out by exclusion keywords.`);
                }
            }
        });

    } catch (error) {
        console.error(error);
    }
}

debugHsinchu();
