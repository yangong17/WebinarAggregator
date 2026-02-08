const fs = require('fs');
const path = require('path');
const { scrapePave } = require('./pave');
const { scrapeWorldAtWork } = require('./worldatwork');
const { scrapeSyndio } = require('./syndio');

async function main() {
    console.log('Starting webinar scraper...');
    console.log('='.repeat(50));

    const allWebinars = [];

    // Scrape all sources
    try {
        console.log('\n[1/3] Scraping Pave...');
        const paveWebinars = await scrapePave();
        allWebinars.push(...paveWebinars);
    } catch (error) {
        console.error('Failed to scrape Pave:', error.message);
    }

    try {
        console.log('\n[2/3] Scraping WorldAtWork...');
        const worldatworkWebinars = await scrapeWorldAtWork();
        allWebinars.push(...worldatworkWebinars);
    } catch (error) {
        console.error('Failed to scrape WorldAtWork:', error.message);
    }

    try {
        console.log('\n[3/3] Scraping Syndio...');
        const syndioWebinars = await scrapeSyndio();
        allWebinars.push(...syndioWebinars);
    } catch (error) {
        console.error('Failed to scrape Syndio:', error.message);
    }

    // Add metadata
    const output = {
        lastUpdated: new Date().toISOString(),
        count: allWebinars.length,
        webinars: allWebinars
    };

    // Save to data folder
    const outputPath = path.join(__dirname, '../../data/webinars.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    // Also copy to public folder so it can be served
    const publicPath = path.join(__dirname, '../../public/webinars.json');
    fs.writeFileSync(publicPath, JSON.stringify(output, null, 2));

    // Generate CSV for Coda compatibility
    const csvHeader = 'source,title,status,airDate,description,link\n';
    const csvRows = allWebinars.map(w => {
        // Escape quotes and handle commas
        const safe = (str) => {
            if (!str) return '';
            str = String(str).replace(/"/g, '""');
            return `"${str}"`;
        };
        return `${safe(w.source)},${safe(w.title)},${safe(w.status)},${safe(w.airDate)},${safe(w.description)},${safe(w.link)}`;
    }).join('\n');

    fs.writeFileSync(path.join(__dirname, '../../data/webinars.csv'), csvHeader + csvRows);

    console.log('\n' + '='.repeat(50));
    console.log(`Done! Saved ${allWebinars.length} webinars to data/webinars.json and data/webinars.csv`);
    console.log(`Also copied to public/webinars.json for serving`);
    console.log(`Last updated: ${output.lastUpdated}`);
}

main().catch(console.error);
