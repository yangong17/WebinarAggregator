const puppeteer = require('puppeteer');

async function scrapeWorldAtWork() {
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

        const url = 'https://worldatwork.org/webinars?delivery=virtuallive+ondemand';
        console.log(`[WorldAtWork] Fetching page...`);

        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        let pageNum = 1;
        const maxPages = 10;

        while (pageNum <= maxPages) {
            console.log(`[WorldAtWork] Scraping page ${pageNum}...`);

            // Wait for content to load
            await new Promise(r => setTimeout(r, 3000));

            // Scroll to load all cards
            await page.evaluate(async () => {
                for (let i = 0; i < 10; i++) {
                    window.scrollBy(0, 300);
                    await new Promise(r => setTimeout(r, 200));
                }
            });

            await new Promise(r => setTimeout(r, 1000));

            // Extract webinars from current page
            const items = await page.evaluate(() => {
                const results = [];
                const seen = new Set();

                const allAnchors = document.querySelectorAll('a[href*="/product/redirect/"]');

                allAnchors.forEach(anchor => {
                    const href = anchor.href;
                    if (seen.has(href)) return;
                    seen.add(href);

                    const anchorText = anchor.innerText.trim();
                    const isMemberOnly = anchorText === 'Member Only Access';

                    let container = anchor.parentElement;
                    let title = '';
                    let category = '';
                    let airDate = '';
                    let status = 'On Demand';

                    for (let i = 0; i < 15 && container && container !== document.body; i++) {
                        const text = container.innerText || '';

                        const liveMatch = text.match(/Live Event[:\s]*(\d{4}-\d{2}-\d{2})/);
                        if (liveMatch && !airDate) {
                            status = 'Upcoming';
                            airDate = liveMatch[1];
                        }

                        const cats = ['Demo Day', 'Workshop', 'Sponsor Delivered', 'Exclusive', 'Featured'];
                        for (const cat of cats) {
                            if (text.includes(cat) && !category) {
                                category = cat;
                            }
                        }

                        if (!title) {
                            const lines = text.split('\n').map(l => l.trim()).filter(l =>
                                l.length >= 20 &&
                                l.length <= 150 &&
                                !l.includes('Skip to') &&
                                !l.includes('Register') &&
                                !l.includes('Member Only') &&
                                !l.includes('Recertification') &&
                                !l.includes('Live Event:') &&
                                !l.includes('Gain Recertification') &&
                                !cats.includes(l)
                            );

                            if (lines.length > 0) {
                                title = lines[0];
                            }
                        }

                        if (title && (airDate || status === 'On Demand')) {
                            break;
                        }

                        container = container.parentElement;
                    }

                    if (!title || title.length < 15) return;

                    results.push({
                        source: 'WorldAtWork',
                        title: title.substring(0, 200),
                        status,
                        airDate,
                        description: [category, isMemberOnly ? 'Members Only' : ''].filter(Boolean).join(' • '),
                        link: href
                    });
                });

                return results;
            });

            // Add only new items
            const newItems = items.filter(item =>
                !webinars.some(w => w.link === item.link)
            );

            console.log(`[WorldAtWork] Page ${pageNum}: Found ${newItems.length} new webinars`);
            webinars.push(...newItems);

            // Try to click next page
            let clicked = false;

            try {
                const nextButtonSelectors = [
                    'nav ul li:last-child button:not([disabled])',
                    'nav ul li button[aria-label*="Next"]',
                    'nav ul li button[aria-label*="next"]',
                    'button[aria-label*="Next page"]',
                ];

                for (const selector of nextButtonSelectors) {
                    try {
                        const btn = await page.$(selector);
                        if (btn) {
                            const isDisabled = await btn.evaluate(el => el.disabled || el.classList.contains('disabled'));
                            if (!isDisabled) {
                                await btn.click();
                                clicked = true;
                                break;
                            }
                        }
                    } catch (e) { }
                }

                if (!clicked) {
                    const paginationButtons = await page.$$('nav ul li button');
                    let foundCurrent = false;

                    for (const btn of paginationButtons) {
                        const isCurrent = await btn.evaluate(el =>
                            el.getAttribute('aria-current') === 'true' ||
                            el.classList.contains('active') ||
                            el.closest('li')?.classList.contains('active')
                        );

                        if (foundCurrent) {
                            const isDisabled = await btn.evaluate(el => el.disabled);
                            if (!isDisabled) {
                                await btn.click();
                                clicked = true;
                                break;
                            }
                        }

                        if (isCurrent) {
                            foundCurrent = true;
                        }
                    }
                }

            } catch (e) {
                console.log(`[WorldAtWork] Pagination error: ${e.message}`);
            }

            if (!clicked) {
                console.log('[WorldAtWork] No more pages');
                break;
            }

            if (newItems.length === 0) {
                console.log('[WorldAtWork] No new items');
                break;
            }

            pageNum++;
            await new Promise(r => setTimeout(r, 3000));
        }

        console.log(`[WorldAtWork] Found ${webinars.length} webinars, now fetching detail pages...`);

        // Now visit each webinar page to get "On Demand Until" date
        for (let i = 0; i < webinars.length; i++) {
            const webinar = webinars[i];
            console.log(`[WorldAtWork] Fetching details ${i + 1}/${webinars.length}: ${webinar.title.substring(0, 40)}...`);

            try {
                await page.goto(webinar.link, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                await new Promise(r => setTimeout(r, 1500));

                // Extract "On Demand Until" date from the detail page
                const detailInfo = await page.evaluate(() => {
                    const pageText = document.body.innerText || '';

                    // Look for "On Demand Until" pattern
                    const onDemandMatch = pageText.match(/On\s*Demand\s*Until[:\s]*([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i);

                    // Also look for other date patterns
                    const expiresMatch = pageText.match(/Available\s*Until[:\s]*([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i);
                    const validMatch = pageText.match(/Valid\s*Through[:\s]*([A-Za-z]+\s+\d{1,2},?\s*\d{4})/i);

                    let onDemandUntil = '';
                    if (onDemandMatch) {
                        onDemandUntil = onDemandMatch[1];
                    } else if (expiresMatch) {
                        onDemandUntil = expiresMatch[1];
                    } else if (validMatch) {
                        onDemandUntil = validMatch[1];
                    }

                    return { onDemandUntil };
                });

                if (detailInfo.onDemandUntil) {
                    // Prepend "On Demand Until" to description only (not airDate)
                    const existingDesc = webinar.description || '';
                    webinar.description = `On Demand Until: ${detailInfo.onDemandUntil}${existingDesc ? ' • ' + existingDesc : ''}`;
                    // Don't set airDate - leave it empty for On Demand webinars
                }

            } catch (e) {
                console.log(`[WorldAtWork] Failed to fetch details for: ${webinar.title.substring(0, 30)}...`);
            }

            // Small delay between requests to be polite
            await new Promise(r => setTimeout(r, 500));
        }

        console.log(`[WorldAtWork] Total scraped: ${webinars.length} webinars with details`);

    } catch (error) {
        console.error('[WorldAtWork] Error scraping:', error.message);
    } finally {
        if (browser) await browser.close();
    }

    return webinars;
}

module.exports = { scrapeWorldAtWork };
