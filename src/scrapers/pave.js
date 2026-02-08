const puppeteer = require('puppeteer');

async function scrapePave() {
  const webinars = [];
  let browser;

  try {
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.goto('https://www.pave.com/insights/events-and-webinars', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('a[href*="explore.pave.com"]', { timeout: 30000 }).catch(() => { });

    // Scroll to load all content
    await autoScroll(page);
    await new Promise(r => setTimeout(r, 2000));

    // First, try to scrape the featured/hero webinar at the top
    const featuredWebinar = await page.evaluate(() => {
      // Try the featured section first - user provided XPath for title: 
      // /html/body/div/div[2]/section[1]/div/div/div/div/div/div/div[2]/div/div/div/a/div/div/div/div[2]/div[2]/h3
      // This translates to looking for h3 in section[1]
      const featuredSection = document.querySelector('section');
      if (!featuredSection) return null;

      const featuredLink = featuredSection.querySelector('a[href*="explore.pave.com"], a[href*="pave.com"]');
      if (!featuredLink) return null;

      const h3 = featuredSection.querySelector('h3');
      const descDiv = featuredSection.querySelector('div[class*="text"]') ||
        h3?.parentElement?.nextElementSibling ||
        featuredSection.querySelector('p');

      const title = h3?.textContent?.trim() || '';
      const description = descDiv?.textContent?.trim() || '';
      const href = featuredLink.href;

      // Get date from text
      const fullText = featuredSection.textContent || '';
      let airDate = '';
      let status = 'On Demand';

      const comingUpMatch = fullText.match(/Coming up[:\s]*([A-Za-z]+)\s+(\d{1,2})[^,]*,?\s*(\d{4})/i);
      if (comingUpMatch) {
        airDate = `${comingUpMatch[1]} ${comingUpMatch[2]}, ${comingUpMatch[3]}`;
        status = 'Upcoming';
      } else {
        const airedMatch = fullText.match(/Aired on[:\s]*([A-Za-z]+)\s+(\d{1,2})[^,]*,?\s*(\d{4})/i);
        if (airedMatch) {
          airDate = `${airedMatch[1]} ${airedMatch[2]}, ${airedMatch[3]}`;
          status = 'On Demand';
        }
      }

      if (title && href) {
        return {
          source: 'Pave',
          title: title.substring(0, 200),
          status,
          airDate,
          description: description.substring(0, 1000),
          link: href
        };
      }
      return null;
    });

    if (featuredWebinar) {
      webinars.push(featuredWebinar);
      console.log(`[Pave] Found featured webinar: "${featuredWebinar.title}"`);
    }

    // Extract regular webinar cards
    const items = await page.evaluate((featuredLink) => {
      const results = [];
      const seen = new Set();
      const currentDate = new Date();

      // Skip the featured link if we already scraped it
      if (featuredLink) {
        seen.add(featuredLink);
      }

      // Find all webinar cards - they have links to explore.pave.com
      const links = document.querySelectorAll('a[href*="explore.pave.com"], a[href*="pave.com/trl"]');

      links.forEach(link => {
        const href = link.href;
        if (seen.has(href)) return;
        seen.add(href);

        // Get title from the link's heading elements or text content
        let title = '';
        let description = '';

        // Look for h1, h2, h3, or strong text within or near the link
        const headingInLink = link.querySelector('h1, h2, h3, h4, strong');
        if (headingInLink) {
          title = headingInLink.textContent.trim();
        }

        // Also check parent containers for headings
        if (!title) {
          let container = link.parentElement;
          for (let i = 0; i < 5 && container; i++) {
            const heading = container.querySelector('h1, h2, h3, h4');
            if (heading) {
              title = heading.textContent.trim();
              break;
            }
            container = container.parentElement;
          }
        }

        // Check the link text itself for title patterns
        if (!title) {
          const linkText = link.textContent.trim();
          // The title is usually the first distinct line before descriptions
          const lines = linkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          for (const line of lines) {
            // Skip date and action text
            if (line.match(/^(Aired on|Coming up|Watch|Register|View)/i)) continue;
            if (line.length >= 15 && line.length <= 150) {
              title = line;
              break;
            }
          }
        }

        // Get description from link context
        const fullLinkText = link.textContent || '';
        const descMatch = fullLinkText.match(/(?:Join|Learn|Discover|Explore|In this|Dive into|A scalable)[^.!?]*[.!?]/i);
        if (descMatch) {
          description = descMatch[0].trim();
        }

        // Also look for paragraph elements nearby
        if (!description) {
          let container = link.parentElement;
          for (let i = 0; i < 3 && container; i++) {
            const p = container.querySelector('p');
            if (p) {
              description = p.textContent.trim();
              break;
            }
            container = container.parentElement;
          }
        }

        // Skip if no good title
        if (!title || title.length < 10) return;

        // Clean up title - remove trailing description fragments
        title = title.split(/(?:Join|Learn|Discover|Planning for)/i)[0].trim();

        // Extract date and status
        let airDate = '';
        let status = 'On Demand';

        const comingUpMatch = fullLinkText.match(/Coming up[:\s]*([A-Za-z]+)\s+(\d{1,2})[^,]*,?\s*(\d{4})/i);
        if (comingUpMatch) {
          airDate = `${comingUpMatch[1]} ${comingUpMatch[2]}, ${comingUpMatch[3]}`;
          status = 'Upcoming';
        } else {
          const airedMatch = fullLinkText.match(/Aired on[:\s]*([A-Za-z]+)\s+(\d{1,2})[^,]*,?\s*(\d{4})/i);
          if (airedMatch) {
            airDate = `${airedMatch[1]} ${airedMatch[2]}, ${airedMatch[3]}`;
            status = 'On Demand';
          }
        }

        // Verify status by comparing dates
        if (airDate) {
          try {
            const webinarDate = new Date(airDate);
            if (!isNaN(webinarDate.getTime())) {
              if (webinarDate > currentDate) {
                status = 'Upcoming';
              } else {
                status = 'On Demand';
              }
            }
          } catch (e) { }
        }

        results.push({
          source: 'Pave',
          title: title.substring(0, 200),
          status,
          airDate,
          description: description.substring(0, 1000),
          link: href
        });
      });

      return results;
    }, featuredWebinar?.link || null);

    // Deduplicate
    const seenLinks = new Set(webinars.map(w => w.link));
    for (const item of items) {
      if (item.link.includes('Compensation-Budgets-Trends-Report')) continue;
      if (item.link.includes('trl2026')) continue; // Broken future event page
      if (item.title === 'Pave Events Webinars') continue;

      if (!seenLinks.has(item.link)) {
        seenLinks.add(item.link);
        webinars.push(item);
      }
    }

    console.log(`[Pave] Scraped ${webinars.length} webinars`);

    // Debug
    const withDates = webinars.filter(w => w.airDate);
    const upcoming = webinars.filter(w => w.status === 'Upcoming');
    console.log(`[Pave] Debug: ${withDates.length} have dates, ${upcoming.length} upcoming`);

  } catch (error) {
    console.error('[Pave] Error scraping:', error.message);
  } finally {
    if (browser) await browser.close();
  }

  return webinars;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 5000);
    });
  });
}

module.exports = { scrapePave };
