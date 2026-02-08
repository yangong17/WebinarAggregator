// Configuration
const CONFIG = {
    dataUrl: './webinars.json',
    githubApiBase: 'https://api.github.com'
};


// State
let webinars = [];
let filteredWebinars = [];

// DOM Elements
const elements = {
    webinarBody: document.getElementById('webinarBody'),
    searchInput: document.getElementById('searchInput'),
    sourceFilter: document.getElementById('sourceFilter'),
    statusFilter: document.getElementById('statusFilter'),
    refreshBtn: document.getElementById('refreshBtn'),
    refreshModal: document.getElementById('refreshModal'),
    closeModal: document.getElementById('closeModal'),
    cancelRefresh: document.getElementById('cancelRefresh'),
    confirmRefresh: document.getElementById('confirmRefresh'),
    patInput: document.getElementById('patInput'),
    repoInput: document.getElementById('repoInput'),
    totalCount: document.getElementById('totalCount'),
    upcomingCount: document.getElementById('upcomingCount'),
    onDemandCount: document.getElementById('onDemandCount'),
    lastUpdated: document.getElementById('lastUpdated')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
    loadStoredCredentials();
    await loadWebinars();
    setupEventListeners();
}

function loadStoredCredentials() {
    const storedPat = localStorage.getItem('github_pat');
    const storedRepo = localStorage.getItem('github_repo');
    if (storedPat) elements.patInput.value = storedPat;
    if (storedRepo) elements.repoInput.value = storedRepo;
}

async function loadWebinars() {
    try {
        const response = await fetch(CONFIG.dataUrl);
        if (!response.ok) throw new Error('Failed to load data');

        const data = await response.json();
        webinars = data.webinars || [];

        // Update stats
        updateStats(data);

        // Initial filter and render
        filterAndRender();
    } catch (error) {
        console.error('Error loading webinars:', error);
        showError('Failed to load webinar data. Please try again later.');
    }
}

function updateStats(data) {
    elements.totalCount.textContent = webinars.length;
    elements.upcomingCount.textContent = webinars.filter(w => w.status === 'Upcoming').length;
    elements.onDemandCount.textContent = webinars.filter(w => w.status === 'On Demand').length;

    if (data.lastUpdated) {
        const date = new Date(data.lastUpdated);
        elements.lastUpdated.textContent = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
}

/**
 * Format a date string for display in a consistent format (e.g., "Jan 28, 2026").
 * Returns "—" for empty/invalid dates.
 */
function formatDisplayDate(dateStr) {
    if (!dateStr || dateStr.trim() === '') return '—';

    // Try to parse the date
    let parsed = new Date(dateStr);

    // If direct parsing fails, try "Month DD, YYYY" format
    if (isNaN(parsed.getTime())) {
        const monthDayYear = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/);
        if (monthDayYear) {
            const month = monthDayYear[1];
            const day = parseInt(monthDayYear[2]);
            const year = monthDayYear[3] ? parseInt(monthDayYear[3]) : new Date().getFullYear();
            parsed = new Date(`${month} ${day}, ${year}`);
        }
    }

    // If we have a valid date, format it consistently
    if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    // Return original if we can't parse it
    return escapeHtml(dateStr);
}

function setupEventListeners() {
    // Search and filters
    elements.searchInput.addEventListener('input', debounce(filterAndRender, 300));
    elements.sourceFilter.addEventListener('change', filterAndRender);
    elements.statusFilter.addEventListener('change', filterAndRender);

    // Refresh modal
    elements.refreshBtn.addEventListener('click', () => openModal());
    elements.closeModal.addEventListener('click', () => closeModal());
    elements.cancelRefresh.addEventListener('click', () => closeModal());
    elements.confirmRefresh.addEventListener('click', () => triggerRefresh());

    // Close modal on outside click
    elements.refreshModal.addEventListener('click', (e) => {
        if (e.target === elements.refreshModal) closeModal();
    });

    // Table sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.dataset.sort));
    });
}

function filterAndRender() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const sourceFilter = elements.sourceFilter.value;
    const statusFilter = elements.statusFilter.value;

    filteredWebinars = webinars.filter(webinar => {
        const matchesSearch = !searchTerm ||
            webinar.title.toLowerCase().includes(searchTerm) ||
            webinar.description.toLowerCase().includes(searchTerm);

        const matchesSource = !sourceFilter || webinar.source === sourceFilter;
        const matchesStatus = !statusFilter || webinar.status === statusFilter;

        return matchesSearch && matchesSource && matchesStatus;
    });

    renderTable();
}

function renderTable() {
    if (filteredWebinars.length === 0) {
        elements.webinarBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No webinars found matching your criteria.</td>
      </tr>
    `;
        return;
    }

    elements.webinarBody.innerHTML = filteredWebinars.map(webinar => `
    <tr>
      <td>
        <span class="source-badge ${webinar.source.toLowerCase().replace(/\s+/g, '')}">${webinar.source}</span>
      </td>
      <td>
        <div class="webinar-title">${escapeHtml(webinar.title)}</div>
      </td>
      <td>
        <span class="status-badge ${webinar.status.toLowerCase().replace(/\s+/g, '-')}">${webinar.status}</span>
      </td>
      <td>
        <span class="webinar-date">${formatDisplayDate(webinar.airDate)}</span>
      </td>
      <td>
        <div class="webinar-description" title="${escapeHtml(webinar.description || '')}">${escapeHtml(webinar.description || '—')}</div>
      </td>
      <td>
        <a href="${escapeHtml(webinar.link)}" target="_blank" rel="noopener noreferrer" class="link-btn">
          View
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </td>
    </tr>
  `).join('');
}

let currentSortColumn = null;
let sortDirection = 'asc';

function parseDate(dateStr) {
    if (!dateStr || dateStr === '—') return null;

    // Try to parse various date formats
    // Format: "Month DD, YYYY" or "YYYY-MM-DD" or "Month DD"
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return parsed.getTime();
    }

    // Try parsing "Month DD, YYYY" format
    const monthDayYear = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/);
    if (monthDayYear) {
        const month = monthDayYear[1];
        const day = parseInt(monthDayYear[2]);
        const year = monthDayYear[3] ? parseInt(monthDayYear[3]) : new Date().getFullYear();
        const date = new Date(`${month} ${day}, ${year}`);
        if (!isNaN(date.getTime())) {
            return date.getTime();
        }
    }

    return null;
}

function sortTable(column) {
    if (currentSortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        sortDirection = 'asc';
    }

    filteredWebinars.sort((a, b) => {
        let valA = a[column] || '';
        let valB = b[column] || '';

        // Special handling for date column - sort chronologically
        if (column === 'airDate') {
            const dateA = parseDate(valA);
            const dateB = parseDate(valB);

            // Put empty dates at the end
            if (dateA === null && dateB === null) return 0;
            if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
            if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

            return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        }

        // Default string comparison for other columns
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    renderTable();
}


function openModal() {
    elements.refreshModal.classList.add('active');
}

function closeModal() {
    elements.refreshModal.classList.remove('active');
}

async function triggerRefresh() {
    const pat = elements.patInput.value.trim();
    const repo = elements.repoInput.value.trim();

    if (!pat || !repo) {
        alert('Please enter both your Personal Access Token and repository name.');
        return;
    }

    // Store credentials
    localStorage.setItem('github_pat', pat);
    localStorage.setItem('github_repo', repo);

    // Disable button
    elements.confirmRefresh.disabled = true;
    elements.confirmRefresh.textContent = 'Triggering...';

    try {
        const response = await fetch(`${CONFIG.githubApiBase}/repos/${repo}/actions/workflows/scraper.yml/dispatches`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${pat}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ref: 'main' })
        });

        if (response.status === 204) {
            alert('Success! The scraper workflow has been triggered. Data will be updated in a few minutes.');
            closeModal();
        } else if (response.status === 404) {
            alert('Error: Repository or workflow not found. Make sure the repository name is correct and the workflow file exists.');
        } else if (response.status === 401 || response.status === 403) {
            alert('Error: Authentication failed. Please check your Personal Access Token.');
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(`Error: ${errorData.message || 'Failed to trigger workflow. Please try again.'}`);
        }
    } catch (error) {
        console.error('Error triggering refresh:', error);
        alert('Error: Failed to connect to GitHub. Please check your internet connection.');
    } finally {
        elements.confirmRefresh.disabled = false;
        elements.confirmRefresh.textContent = 'Trigger Refresh';
    }
}

function showError(message) {
    elements.webinarBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="6">${escapeHtml(message)}</td>
    </tr>
  `;
}

// Utilities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
