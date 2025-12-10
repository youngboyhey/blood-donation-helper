import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

async function fetchHTMLWithPuppeteer(url, browser) {
    console.log(`[Puppeteer] Fetching: ${url}`);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        const content = await page.content();
        await page.close();
        return content;
    } catch (e) {
        console.error(`[Puppeteer] Failed ${url}:`, e.message);
        await page.close();
        throw e;
    }
}

async function testWebScraper() {
    const source = {
        type: 'web',
        id: 'taipei',
        name: '台北捐血中心',
        url: 'https://www.tp.blood.org.tw/xmdoc?xsmsid=0P062646965467323284',
        baseUrl: 'https://www.tp.blood.org.tw'
    };

    console.log(`[Test] Starting Web Scraper Test for: ${source.name}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const html = await fetchHTMLWithPuppeteer(source.url, browser);
        const $ = cheerio.load(html);
        const targetLinks = [];

        console.log(`[Test] Main page fetched. Parsing links...`);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        $('a').each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const href = $el.attr('href');
            const titleAttr = $el.attr('title') || '';

            const combinedText = text + ' ' + titleAttr;

            // 嚴格過濾：必須包含「捐血活動」
            if (combinedText.includes('捐血活動') && !combinedText.includes('暫停')) {
                // 排除總表、新聞稿、活動報導等
                if (combinedText.includes('總表') || combinedText.includes('行事曆') ||
                    combinedText.includes('一覽') || combinedText.includes('場次表') ||
                    combinedText.includes('月行程') || combinedText.includes('新聞稿') ||
                    combinedText.includes('活動報導') || combinedText.includes('怎麼辦')) {
                    console.log(`[Test] SKIP (非活動): ${combinedText.slice(0, 40)}...`);
                    return;
                }

                // Title-Based Date Filtering
                const title = combinedText;
                const dateMatches = title.match(/(\d{2,4})[年\/-](\d{1,2})[月\/-](\d{1,2})/g);
                const shortDateMatches = title.match(/(\d{1,2})[月\/](\d{1,2})/g);

                let hasFutureDate = false;
                let hasDateInfo = false;

                const parseDate = (dStr) => {
                    let y, m, d;
                    if (dStr.includes('年')) {
                        const parts = dStr.split(/[年月日]/);
                        y = parseInt(parts[0]);
                        m = parseInt(parts[1]);
                        d = parseInt(parts[2]);
                        if (y < 1911) y += 1911;
                    }
                    else if (dStr.includes('/') || dStr.includes('-')) {
                        const parts = dStr.split(/[\/-]/);
                        y = parseInt(parts[0]);
                        if (y < 1911 && y > 100) y += 1911;
                        m = parseInt(parts[1]);
                        d = parseInt(parts[2]);
                    }
                    return new Date(y, m - 1, d);
                };

                if (dateMatches) {
                    hasDateInfo = true;
                    for (const match of dateMatches) {
                        try {
                            const evtDate = parseDate(match);
                            if (evtDate >= today) {
                                hasFutureDate = true;
                                break;
                            }
                        } catch (e) { }
                    }
                } else if (shortDateMatches) {
                    hasDateInfo = true;
                    const currentYear = today.getFullYear();
                    for (const match of shortDateMatches) {
                        const parts = match.split(/[\/月]/);
                        const m = parseInt(parts[0]);
                        const d = parseInt(parts[1]);
                        let evtDate = new Date(currentYear, m - 1, d);
                        if (evtDate < today && m < today.getMonth()) evtDate.setFullYear(currentYear + 1);
                        if (evtDate >= today) {
                            hasFutureDate = true;
                            break;
                        }
                    }
                }

                if (hasDateInfo && !hasFutureDate) {
                    console.log(`[Test] SKIP (過期): ${title.slice(0, 40)}...`);
                    return;
                }

                // 顯示找到的連結
                const displayText = titleAttr || text;
                console.log(`[Test] ✓ FOUND EVENT: ${displayText.slice(0, 50)}...`);

                if (href) {
                    const fullUrl = href.startsWith('http') ? href : source.baseUrl + href;
                    targetLinks.push(fullUrl);
                }
            }
        });

        const uniqueLinks = [...new Set(targetLinks)].slice(0, 5);
        console.log(`\n[Test] Found ${uniqueLinks.length} event links. Testing...`);

        for (const fullUrl of uniqueLinks) {
            console.log(`\n[Test] Visiting: ${fullUrl}`);
            const detailHtml = await fetchHTMLWithPuppeteer(fullUrl, browser);
            const $d = cheerio.load(detailHtml);

            // 總表頁檢測
            const pageText = $d('body').text();
            const dateCount = (pageText.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g) || []).length;
            if (dateCount > 5) {
                console.log(`[Test] FAIL: Summary Page (${dateCount} dates)`);
                continue;
            }

            // 尋找海報圖片
            const contentSelectors = ['div.xccont img', 'div.pt-3 img', 'article img', '.content img', 'img'];
            let foundImages = [];

            for (const selector of contentSelectors) {
                if (foundImages.length > 0) break;

                $d(selector).each((i, el) => {
                    const src = $d(el).attr('src') || $d(el).attr('data-src');
                    if (!src) return;

                    const url = src.startsWith('http') ? src : source.baseUrl + src;

                    if (!url.includes('file_pool') && !url.includes('upload') &&
                        !url.includes('xmimg') && !url.includes('storage')) return;

                    if (url.toLowerCase().endsWith('.svg')) return;
                    if (url.toLowerCase().includes('qr')) return;

                    const width = $d(el).attr('width');
                    const height = $d(el).attr('height');
                    if ((width && parseInt(width) < 100) || (height && parseInt(height) < 100)) return;

                    if (url.toLowerCase().includes('logo') || url.toLowerCase().includes('icon')) return;

                    console.log(`[Test] ✓ POSTER: ${url.slice(0, 80)}...`);
                    foundImages.push(url);
                });
            }

            if (foundImages.length === 0) {
                console.log(`[Test] ✗ No poster found`);
            }
        }

    } catch (e) {
        console.error(`[Test] Error: ${e.message}`);
    } finally {
        await browser.close();
    }
}

testWebScraper();
