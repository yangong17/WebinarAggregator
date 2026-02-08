# Webinar Aggregator

A semi-static webpage that aggregates webinars from Pave, WorldAtWork, and Syndio into a unified table.

## Features

- **Automated Scraping**: GitHub Actions runs a daily scraper to keep data fresh
- **Manual Refresh**: Trigger data refresh from the UI with a GitHub PAT
- **Search & Filter**: Find webinars by title, description, source, or status
- **Sortable Table**: Sort by any column
- **Mobile Responsive**: Works on all device sizes
- **Embeddable**: Use the hosted page in Coda or other tools via iframe

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/WebinarAggregator.git
cd WebinarAggregator
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Scraper Locally

```bash
npm run scrape
```

### 4. View Locally

```bash
npm start
```

Open `http://localhost:3000` in your browser.

## Hosting on GitHub Pages

1. Push the repository to GitHub
2. Go to **Settings > Pages**
3. Set source to `main` branch and `/public` folder
4. Your site will be available at `https://YOUR_USERNAME.github.io/WebinarAggregator/`

## Triggering Refresh from UI

1. Click the "Refresh Data" button
2. Enter your GitHub Personal Access Token (with `repo` scope)
3. Enter your repository name (e.g., `username/WebinarAggregator`)
4. Click "Trigger Refresh"

The scraper will run and data will update in ~2-3 minutes.

## Coda Integration

You have two options depending on your needs:

### Option 1: Visual Embed (View Only)
Use this if you just want to **display** the table inside Coda without importing the data.
1. In Coda, use the Embed formula:
   ```
   =Embed("https://yangong17.github.io/WebinarAggregator/public/embed.html", width: 1000, height: 800)
   ```

### Option 2: Data Sync (Import Data)
Use this if you want the actual data rows in Coda for filtering, sorting, or adding your own columns.
1. In Coda, type `/Source` and select **CSV**.
2. Paste this URL:
   ```
   https://yangong17.github.io/WebinarAggregator/public/webinars.csv
   ```
3. Set the sync schedule to **Daily**.

## Project Structure

```
WebinarAggregator/
├── .github/
│   └── workflows/
│       └── scraper.yml      # GitHub Actions workflow
├── data/
│   └── webinars.json        # Scraped data (auto-updated)
├── public/
│   ├── index.html           # Main page
│   ├── style.css            # Styling
│   └── app.js               # Frontend logic
├── src/
│   └── scrapers/
│       ├── index.js         # Main orchestrator
│       ├── pave.js          # Pave scraper
│       ├── worldatwork.js   # WorldAtWork scraper
│       └── syndio.js        # Syndio scraper
├── package.json
└── README.md
```

## License

ISC
