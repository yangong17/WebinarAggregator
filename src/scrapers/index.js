const fs = require('fs');
const path = require('path');
const { scrapePave } = require('./pave');
const { scrapeWorldAtWork } = require('./worldatwork');
const { scrapeSyndio } = require('./syndio');

/**
 * Parse a date string and return a Date object, or null if invalid.
 */
function parseDate(dateStr) {
    if (!dateStr || dateStr === '—' || dateStr.trim() === '') return null;

    // Try direct parsing (handles ISO format like "2026-02-10")
    let parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    // Try parsing "Month DD, YYYY" format (e.g., "January 28, 2026")
    const monthDayYear = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/);
    if (monthDayYear) {
        const month = monthDayYear[1];
        const day = parseInt(monthDayYear[2]);
        const year = monthDayYear[3] ? parseInt(monthDayYear[3]) : new Date().getFullYear();
        parsed = new Date(`${month} ${day}, ${year}`);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
}

/**
 * Verify and correct webinar status based on current date.
 * If the airDate is in the past, the status should be "On Demand".
 */
function verifyStatus(webinars) {
    const now = new Date();
    let corrected = 0;

    for (const webinar of webinars) {
        const airDate = parseDate(webinar.airDate);
        if (airDate && airDate < now && webinar.status === 'Upcoming') {
            console.log(`[Status Fix] "${webinar.title}" (${webinar.airDate}) changed from Upcoming to On Demand`);
            webinar.status = 'On Demand';
            corrected++;
        }
    }

    if (corrected > 0) {
        console.log(`[Status Fix] Corrected ${corrected} webinar(s) with past dates marked as Upcoming.`);
    }
    return webinars;
}

/**
 * Load existing webinar data from disk.
 */
function loadExistingData(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return data.webinars || [];
        }
    } catch (error) {
        console.warn(`Could not load existing data: ${error.message}`);
    }
    return [];
}

/**
 * Merge new webinars with existing data.
 * - New entries are added.
 * - Existing entries are updated only if critical fields change.
 * - Returns true if there were any changes.
 */
function mergeWebinars(existing, scraped) {
    const existingByLink = new Map(existing.map(w => [w.link, w]));
    const merged = [];
    let hasChanges = false;

    for (const newWebinar of scraped) {
        const oldWebinar = existingByLink.get(newWebinar.link);
        if (oldWebinar) {
            // Check if critical fields changed
            const changed = oldWebinar.title !== newWebinar.title ||
                oldWebinar.status !== newWebinar.status ||
                oldWebinar.airDate !== newWebinar.airDate;
            if (changed) {
                merged.push(newWebinar);
                hasChanges = true;
            } else {
                // Keep old version (preserves any extra data)
                merged.push(oldWebinar);
            }
            existingByLink.delete(newWebinar.link);
        } else {
            // New webinar
            merged.push(newWebinar);
            hasChanges = true;
        }
    }

    // Note: Webinars that were in existing but not in scraped are dropped
    // (they may have been removed from the source)
    if (existingByLink.size > 0) {
        console.log(`[Merge] ${existingByLink.size} webinar(s) no longer found on source and will be removed.`);
        hasChanges = true;
    }

    return { merged, hasChanges };
}

async function main() {
    console.log('Starting webinar scraper...');
    console.log('='.repeat(50));

    // Load existing data for intelligent merge
    const existingDataPath = path.join(__dirname, '../../data/webinars.json');
    const existingWebinars = loadExistingData(existingDataPath);
    console.log(`Loaded ${existingWebinars.length} existing webinars.`);

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

    // Verify and correct status based on current date
    console.log('\n[Status Verification] Checking webinar dates...');
    verifyStatus(allWebinars);

    // Merge with existing data
    const { merged, hasChanges } = mergeWebinars(existingWebinars, allWebinars);

    if (!hasChanges) {
        console.log('\n[No Changes] Data is up to date. Skipping file write.');
        return;
    }

    console.log(`\n[Changes Detected] Updating data files...`);

    // Add metadata
    const output = {
        lastUpdated: new Date().toISOString(),
        count: merged.length,
        webinars: merged
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
    fs.writeFileSync(path.join(__dirname, '../../public/webinars.csv'), csvHeader + csvRows);

    console.log('\n' + '='.repeat(50));
    console.log(`Done! Saved ${allWebinars.length} webinars to data/webinars.json and data/webinars.csv`);
    console.log(`Also copied to public/webinars.json and public/webinars.csv for serving`);
    console.log(`Last updated: ${output.lastUpdated}`);
}

main().catch(console.error);
