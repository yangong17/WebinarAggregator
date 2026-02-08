const puppeteer = require('puppeteer');

async function scrapeSyndio() {
    const webinars = [];
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const url = 'https://synd.io/resources/?_type=webinar';
        console.log(`[Syndio] Fetching page...`);

        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        await new Promise(r => setTimeout(r, 5000));

        await page.evaluate(async () => {
            for (let i = 0; i < 5; i++) {
                window.scrollBy(0, 500);
                await new Promise(r => setTimeout(r, 300));
            }
            window.scrollTo(0, 0);
        });

        await new Promise(r => setTimeout(r, 2000));

        const items = await page.evaluate(() => {
            const results = [];
            const seen = new Set();

            // Find all "Watch now" links
            const watchButtons = document.querySelectorAll('a');

            watchButtons.forEach(button => {
                const buttonText = button.innerText.trim().toLowerCase();

                if (!buttonText.includes('watch now') && !buttonText.includes('watch')) {
                    return;
                }

                const href = button.href;
                if (!href || seen.has(href)) return;
                if (!href.includes('synd.io')) return;

                seen.add(href);

                let container = button.parentElement;
                let title = '';
                let airDate = '';

                for (let i = 0; i < 10 && container; i++) {
                    const heading = container.querySelector('h2, h3, h4, h5');
                    const text = container.innerText;

                    if (heading && text.toLowerCase().includes('aired on')) {
                        // Get just the first line of the heading, clean up
                        title = heading.innerText.trim().split('\n')[0].trim();

                        const dateMatch = text.match(/Aired on[:\s]*([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i);
                        if (dateMatch) {
                            airDate = dateMatch[1];
                        }
                        break;
                    }
                    container = container.parentElement;
                }

                // Clean up title - remove any "Empty heading" or similar artifacts
                title = title.replace(/Empty heading/gi, '').trim();

                if (!title || title.length < 10) return;

                results.push({
                    source: 'Syndio',
                    title: title.substring(0, 200),
                    status: 'On Demand',
                    airDate: airDate,
                    description: '',
                    link: href
                });
            });

            return results;
        });

        webinars.push(...items);
        console.log(`[Syndio] Scraped ${items.length} webinars`);

    } catch (error) {
        console.error('[Syndio] Error scraping:', error.message);
    } finally {
        if (browser) await browser.close();
    }

    return webinars;
}

module.exports = { scrapeSyndio };
