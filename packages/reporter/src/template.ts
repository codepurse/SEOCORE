export const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEOCore Audit Intelligence Report</title>
  <style>
    /* ==========================================================================
       RESET & BASE VARIABLE SPECIFICATIONS
       ========================================================================== */
    :root {
      --bg-app: #050505;
      --bg-sidebar: #08080a;
      --bg-card: #0c0c0e;
      --bg-bezel: rgba(255, 255, 255, 0.03);
      --border-card: rgba(255, 255, 255, 0.06);
      --border-bezel: rgba(255, 255, 255, 0.04);
      --border-focus: rgba(255, 255, 255, 0.2);

      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #52525b;

      --color-emerald: #10b981;
      --color-emerald-bg: rgba(16, 185, 129, 0.1);
      --color-rose: #f43f5e;
      --color-rose-bg: rgba(244, 63, 94, 0.1);
      --color-amber: #f59e0b;
      --color-amber-bg: rgba(245, 158, 11, 0.1);
      --color-blue: #3b82f6;
      --color-blue-bg: rgba(59, 130, 246, 0.1);

      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      background-color: var(--bg-app);
      color: var(--text-secondary);
      font-family: var(--font-sans);
      min-height: 100vh;
      line-height: 1.5;
      overflow-x: hidden;
      display: flex;
    }

    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-app);
    }
    ::-webkit-scrollbar-thumb {
      background: var(--border-card);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-muted);
    }

    /* ==========================================================================
       DOUBLE-BEZEL / NESTED ARCHITECTURE
       ========================================================================== */
    .db-outer {
      background: var(--bg-bezel);
      border: 1px solid var(--border-bezel);
      padding: 6px;
      border-radius: 24px;
      transition: border-color 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .db-outer:hover {
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-2px);
    }
    .db-inner {
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.02);
      border-radius: 18px;
      padding: 24px;
      height: 100%;
    }

    /* ==========================================================================
       SIDEBAR LAYOUT
       ========================================================================== */
    aside {
      width: 280px;
      background-color: var(--bg-sidebar);
      border-right: 1px solid var(--border-card);
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 48px;
      text-decoration: none;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 8px;
    }

    .brand-name {
      color: var(--text-primary);
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-grow: 1;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .nav-link:hover, .nav-link.active {
      background: var(--bg-bezel);
      color: var(--text-primary);
    }

    .nav-link svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 1.75;
      fill: none;
    }

    .sidebar-footer {
      border-top: 1px solid var(--border-card);
      padding-top: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .engine-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: var(--color-emerald);
      border-radius: 50%;
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      }
      70% {
        transform: scale(1);
        box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      }
    }

    /* ==========================================================================
       MAIN CONTENT CONTAINER
       ========================================================================== */
    main {
      margin-left: 280px;
      flex-grow: 1;
      padding: 48px 64px;
      max-w: 1600px;
    }

    /* ==========================================================================
       TOP HEADER / NAV SYSTEM
       ========================================================================== */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 48px;
      gap: 24px;
    }

    .header-info h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.03em;
      margin-bottom: 4px;
    }

    .header-info .analyzed-url {
      font-family: var(--font-mono);
      font-size: 0.9rem;
      color: var(--color-blue);
      text-decoration: none;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    /* Button Pattern: Button-in-Button Trailing Icon */
    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      color: var(--text-primary);
      font-weight: 600;
      font-size: 0.9rem;
      padding: 8px 16px;
      border-radius: 9999px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .btn-action:hover {
      background: var(--bg-bezel);
      border-color: var(--border-focus);
    }

    .btn-action:active {
      transform: scale(0.98);
    }

    .btn-action-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: -8px;
    }

    .btn-action-icon svg {
      width: 14px;
      height: 14px;
      stroke: var(--text-primary);
      stroke-width: 2;
      fill: none;
    }

    /* ==========================================================================
       GRID SYSTEM & SPACING
       ========================================================================== */
    .section-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .section-title span {
      background: var(--bg-bezel);
      border: 1px solid var(--border-card);
      color: var(--text-secondary);
      font-size: 0.8rem;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 6px;
      font-family: var(--font-mono);
    }

    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 24px;
      margin-bottom: 64px;
    }

    .col-full { grid-column: span 12; }
    .col-8 { grid-column: span 8; }
    .col-4 { grid-column: span 4; }
    .col-3 { grid-column: span 3; }

    @media (max-width: 1280px) {
      .col-8, .col-4 { grid-column: span 12; }
      .col-3 { grid-column: span 6; }
    }

    @media (max-width: 768px) {
      .col-3 { grid-column: span 12; }
    }

    /* ==========================================================================
       SCORE OVERVIEW CARDS
       ========================================================================== */
    .score-hero-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      position: relative;
    }

    .score-ring-wrap {
      position: relative;
      width: 160px;
      height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }

    .progress-ring {
      position: absolute;
      transform: rotate(-90deg);
    }

    .progress-ring__circle {
      transition: stroke-dashoffset 0.8s ease;
    }

    .score-number {
      font-size: 3rem;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.04em;
      font-family: var(--font-mono);
      line-height: 1;
    }

    .score-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 4px;
    }

    .score-status-badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 16px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.85rem;
      letter-spacing: -0.01em;
    }

    /* Crawl Summary Strip */
    .crawl-summary-strip {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-top: 24px;
      width: 100%;
      border-top: 1px solid var(--border-card);
      padding-top: 24px;
    }

    .summary-stat {
      text-align: center;
    }

    .summary-stat-val {
      font-family: var(--font-mono);
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .summary-stat-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
      margin-top: 4px;
    }

    /* Category Cards */
    .category-card {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
    }

    .category-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .category-card-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.01em;
      text-transform: capitalize;
    }

    .category-card-score {
      font-family: var(--font-mono);
      font-size: 1.25rem;
      font-weight: 700;
    }

    .category-progress-container {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 3px;
      overflow: hidden;
      margin: 8px 0;
    }

    .category-progress-bar {
      height: 100%;
      width: 0%;
      border-radius: 3px;
      transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .category-card-stats {
      display: flex;
      gap: 12px;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .category-stat-dot {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .category-stat-dot span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    /* Colors and Backgrounds */
    .bg-emerald { background-color: var(--color-emerald); color: #042f2e; }
    .bg-rose { background-color: var(--color-rose); color: #4c0519; }
    .bg-amber { background-color: var(--color-amber); color: #451a03; }
    .bg-blue { background-color: var(--color-blue); color: #172554; }

    .text-emerald { color: var(--color-emerald); }
    .text-rose { color: var(--color-rose); }
    .text-amber { color: var(--color-amber); }
    .text-blue { color: var(--color-blue); }

    /* ==========================================================================
       QUICK WINS SECTION
       ========================================================================== */
    .quick-wins-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .quick-win-item {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 16px 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-left: 4px solid var(--color-emerald);
      border-radius: 12px;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .quick-win-item:hover {
      border-color: var(--border-focus);
      border-left-color: var(--color-emerald);
      background: var(--bg-bezel);
    }

    .quick-win-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-emerald-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .quick-win-icon svg {
      width: 20px;
      height: 20px;
      stroke: var(--color-emerald);
      stroke-width: 2.25;
      fill: none;
    }

    .quick-win-details {
      flex-grow: 1;
    }

    .quick-win-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .quick-win-rec {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .quick-win-url {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: var(--color-blue);
      margin-top: 4px;
      display: block;
      word-break: break-all;
    }

    /* Severity Distribution Chart */
    .severity-chart-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .sev-bar-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sev-bar-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .sev-bar-label {
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    .sev-bar-track {
      width: 100%;
      height: 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-card);
      border-radius: 4px;
      overflow: hidden;
    }

    .sev-bar-fill {
      height: 100%;
      width: 0%;
      border-radius: 4px;
      transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* ==========================================================================
       ISSUES HUB SECTION
       ========================================================================== */
    .issues-filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .filter-tabs {
      display: flex;
      background: var(--bg-bezel);
      border: 1px solid var(--border-card);
      padding: 4px;
      border-radius: 12px;
      gap: 4px;
    }

    .filter-tab {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 0.85rem;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-tab:hover {
      color: var(--text-primary);
    }

    .filter-tab.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .tab-badge {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 1px 6px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
    }

    .filter-tab.active .tab-badge {
      background: var(--border-card);
      color: var(--text-secondary);
    }

    .search-input-wrapper {
      position: relative;
      width: 320px;
    }

    .search-input-wrapper svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      stroke: var(--text-muted);
      stroke-width: 2;
      fill: none;
      pointer-events: none;
    }

    .search-input {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 10px;
      padding: 10px 16px 10px 42px;
      color: var(--text-primary);
      font-size: 0.9rem;
      outline: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .search-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 1px var(--border-focus);
    }

    /* Collapsible Findings Stack */
    .findings-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .finding-card {
      border: 1px solid var(--border-card);
      background: var(--bg-card);
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .finding-card:hover {
      border-color: var(--border-focus);
    }

    .finding-card-header {
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      user-select: none;
    }

    .finding-chevron {
      width: 16px;
      height: 16px;
      stroke: var(--text-muted);
      stroke-width: 2.25;
      fill: none;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      flex-shrink: 0;
    }

    .finding-card.expanded .finding-chevron {
      transform: rotate(90deg);
    }

    .badge {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .finding-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
      flex-grow: 1;
    }

    .finding-category-badge {
      font-size: 0.75rem;
      color: var(--text-muted);
      border: 1px solid var(--border-card);
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      font-family: var(--font-mono);
      flex-shrink: 0;
    }

    .finding-card-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      border-top: 0 solid var(--border-card);
      background: rgba(0, 0, 0, 0.15);
    }

    .finding-card.expanded .finding-card-details {
      border-top-width: 1px;
    }

    .finding-details-inner {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .finding-detail-grid {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 16px;
      font-size: 0.85rem;
    }

    .finding-detail-lbl {
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      padding-top: 2px;
    }

    .finding-detail-val {
      color: var(--text-secondary);
    }

    .finding-code-evidence {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-card);
      border-radius: 8px;
      padding: 12px;
      color: #e4e4e7;
      overflow-x: auto;
      white-space: pre;
    }

    .finding-action-card {
      background: var(--color-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.15);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .finding-action-card svg {
      width: 16px;
      height: 16px;
      stroke: var(--color-emerald);
      stroke-width: 2.5;
      fill: none;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .finding-action-text {
      font-size: 0.85rem;
      color: #34d399;
    }

    /* ==========================================================================
       CRAWL TOPOLOGY SECTION
       ========================================================================== */
    .crawl-table-filters {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .table-container {
      width: 100%;
      border: 1px solid var(--border-card);
      border-radius: 12px;
      background: var(--bg-card);
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.01);
      border-bottom: 1px solid var(--border-card);
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 14px 24px;
    }

    td {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border-card);
      font-size: 0.85rem;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .table-url-cell {
      max-width: 420px;
      word-break: break-all;
    }

    .table-url-cell a {
      font-family: var(--font-mono);
      color: var(--text-primary);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .table-url-cell a:hover {
      color: var(--color-blue);
    }

    .table-badge-orphan {
      font-size: 0.65rem;
      font-weight: 700;
      background: var(--color-rose-bg);
      color: var(--color-rose);
      border: 1px solid rgba(244, 63, 94, 0.2);
      padding: 1px 6px;
      border-radius: 4px;
      margin-left: 8px;
      text-transform: uppercase;
    }

    .status-code-badge {
      font-family: var(--font-mono);
      font-weight: 700;
      font-size: 0.8rem;
      padding: 2px 8px;
      border-radius: 6px;
    }

    .status-code-200 { background: var(--color-emerald-bg); color: var(--color-emerald); }
    .status-code-300 { background: var(--color-amber-bg); color: var(--color-amber); }
    .status-code-400, .status-code-500 { background: var(--color-rose-bg); color: var(--color-rose); }

    .table-score-badge {
      font-family: var(--font-mono);
      font-weight: 700;
    }

    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-top: 1px solid var(--border-card);
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .pagination-actions {
      display: flex;
      gap: 8px;
    }

    .pagination-btn {
      background: var(--bg-bezel);
      border: 1px solid var(--border-card);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .pagination-btn:hover:not(:disabled) {
      background: var(--border-card);
      color: var(--text-primary);
    }

    .pagination-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    /* ==========================================================================
       CATEGORY ACCORDION SECTION
       ========================================================================== */
    .category-accordion {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cat-accordion-item {
      border: 1px solid var(--border-card);
      background: var(--bg-card);
      border-radius: 12px;
      overflow: hidden;
    }

    .cat-accordion-header {
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }

    .cat-accordion-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-primary);
      text-transform: capitalize;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cat-accordion-title svg {
      width: 20px;
      height: 20px;
      stroke: var(--text-secondary);
      stroke-width: 1.75;
      fill: none;
    }

    .cat-accordion-meta {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .cat-accordion-score {
      font-family: var(--font-mono);
      font-size: 1.1rem;
      font-weight: 700;
    }

    .cat-accordion-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      border-top: 0 solid var(--border-card);
      background: rgba(0, 0, 0, 0.1);
    }

    .cat-accordion-item.expanded .cat-accordion-details {
      border-top-width: 1px;
    }

    .cat-accordion-inner {
      padding: 24px;
    }

    .cat-passed-state {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--color-emerald-bg);
      border: 1px solid rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-radius: 8px;
      padding: 16px 20px;
      font-size: 0.9rem;
    }

    .cat-passed-state svg {
      width: 20px;
      height: 20px;
      stroke: var(--color-emerald);
      stroke-width: 2.5;
      fill: none;
      flex-shrink: 0;
    }

    /* ==========================================================================
       FOOTER & CONFIG
       ========================================================================== */
    .stats-info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    @media (max-width: 768px) {
      .stats-info-grid { grid-template-columns: 1fr; }
    }

    .info-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.02);
      padding-bottom: 12px;
    }

    .info-lbl {
      color: var(--text-muted);
      font-weight: 600;
    }

    .info-val {
      font-family: var(--font-mono);
      color: var(--text-primary);
    }

    footer {
      border-top: 1px solid var(--border-card);
      padding: 32px 0 64px 0;
      margin-top: 96px;
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* ==========================================================================
       RESPONSIVE & COLLAPSED STATES
       ========================================================================== */
    @media (max-width: 1024px) {
      aside {
        width: 100%;
        height: auto;
        position: relative;
        border-right: none;
        border-bottom: 1px solid var(--border-card);
        padding: 24px;
      }
      .brand {
        margin-bottom: 24px;
      }
      .nav-links {
        flex-direction: row;
        overflow-x: auto;
        padding-bottom: 12px;
      }
      .nav-link {
        white-space: nowrap;
      }
      .sidebar-footer {
        display: none;
      }
      main {
        margin-left: 0;
        padding: 32px 24px;
      }
    }

    /* ==========================================================================
       PRINT SPECIFIC STYLES
       ========================================================================== */
    @media print {
      aside, .header-actions, .issues-filter-bar, .pagination-bar, .crawl-table-filters, .pagination-actions {
        display: none !important;
      }
      body {
        background: #fff;
        color: #111;
      }
      main {
        margin-left: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
      }
      .db-outer {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
      }
      .db-inner {
        background: transparent !important;
        border: 1px solid #ddd !important;
        padding: 20px !important;
        page-break-inside: avoid;
      }
      .finding-card-details, .cat-accordion-details {
        max-height: none !important;
        border-top-width: 1px !important;
        background: #fcfcfc !important;
      }
      .finding-card-header svg, .cat-accordion-header svg {
        display: none !important;
      }
    }
  </style>
</head>
<body>

  <!-- ==========================================================================
       SIDEBAR NAVIGATION
       ========================================================================== -->
  <aside>
    <a href="#" class="brand">
      <div class="brand-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.25">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </div>
      <span class="brand-name">SEOCore</span>
    </a>

    <div class="nav-links">
      <a href="#overview" class="nav-link active" onclick="setActiveLink(this)">
        <svg viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        Overview
      </a>
      <a href="#quickwins" class="nav-link" onclick="setActiveLink(this)">
        <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        Quick Wins
      </a>
      <a href="#issues" class="nav-link" onclick="setActiveLink(this)">
        <svg viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        Issues Hub
      </a>
      <a href="#topology" class="nav-link" onclick="setActiveLink(this)">
        <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        Crawl Topology
      </a>
      <a href="#categories" class="nav-link" onclick="setActiveLink(this)">
        <svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>
        Breakdowns
      </a>
      <a href="#engine" class="nav-link" onclick="setActiveLink(this)">
        <svg viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
        Audit Stats
      </a>
    </div>

    <div class="sidebar-footer">
      <div class="engine-status">
        <div class="pulse-dot"></div>
        <span>Intelligence Active</span>
      </div>
      <div style="font-size: 0.75rem; color: var(--text-muted);">
        SEOCore Engine v1.0.0
      </div>
    </div>
  </aside>

  <!-- ==========================================================================
       MAIN WORKSPACE
       ========================================================================== -->
  <main>
    <header>
      <div class="header-info">
        <h1>SEO Core Health & Audit Report</h1>
        <a id="targetUrlLink" href="#" target="_blank" class="analyzed-url">loading...</a>
      </div>
      <div class="header-actions">
        <button class="btn-action" onclick="exportResult()">
          Export JSON
          <div class="btn-action-icon">
            <svg viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </div>
        </button>
        <button class="btn-action" onclick="window.print()">
          Print Report
          <div class="btn-action-icon">
            <svg viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
          </div>
        </button>
      </div>
    </header>

    <!-- ==========================================================================
         OVERVIEW & HEALTH SUMMARY
         ========================================================================== -->
    <section id="overview" class="section-title">
      Dashboard Overview <span>Global Metrics</span>
    </section>

    <div class="dashboard-grid">
      <!-- HERO overall Score: 4 column span -->
      <div class="db-outer col-4" style="grid-row: span 2;">
        <div class="db-inner score-hero-container">
          <div class="score-ring-wrap">
            <svg class="progress-ring" width="160" height="160">
              <circle stroke="rgba(255,255,255,0.02)" stroke-width="10" fill="transparent" r="70" cx="80" cy="80"/>
              <circle id="scoreProgressRing" class="progress-ring__circle" stroke-width="10" fill="transparent" r="70" cx="80" cy="80" stroke-linecap="round" stroke-dasharray="439.8" stroke-dashoffset="439.8"/>
            </svg>
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2;">
              <span id="scoreNumber" class="score-number">--</span>
              <span class="score-label">Score</span>
            </div>
          </div>
          <div id="scoreStatusBadge" class="score-status-badge">Calculating...</div>

          <div class="crawl-summary-strip">
            <div class="summary-stat">
              <div id="statPages" class="summary-stat-val">--</div>
              <div class="summary-stat-lbl">Crawled</div>
            </div>
            <div class="summary-stat">
              <div id="statTime" class="summary-stat-val">--</div>
              <div class="summary-stat-lbl">Time (s)</div>
            </div>
            <div class="summary-stat">
              <div id="statCritical" class="summary-stat-val text-rose">--</div>
              <div class="summary-stat-lbl">Critical</div>
            </div>
            <div class="summary-stat">
              <div id="statError" class="summary-stat-val text-rose">--</div>
              <div class="summary-stat-lbl">Errors</div>
            </div>
            <div class="summary-stat">
              <div id="statWarning" class="summary-stat-val text-amber">--</div>
              <div class="summary-stat-lbl">Warns</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Category Breakdown Overview: 8 column span -->
      <!-- Categorized scores grid inside -->
      <div class="col-8" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;">
        <div id="catCard-indexing" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">Indexing Health</span>
            <span id="catScore-indexing" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-indexing" class="category-progress-bar"></div></div>
          <div id="catCounts-indexing" class="category-card-stats">--</div>
        </div></div>

        <div id="catCard-metadata" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">Metadata Quality</span>
            <span id="catScore-metadata" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-metadata" class="category-progress-bar"></div></div>
          <div id="catCounts-metadata" class="category-card-stats">--</div>
        </div></div>

        <div id="catCard-performance" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">Performance Budget</span>
            <span id="catScore-performance" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-performance" class="category-progress-bar"></div></div>
          <div id="catCounts-performance" class="category-card-stats">--</div>
        </div></div>

        <div id="catCard-accessibility" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">Accessibility Compliance</span>
            <span id="catScore-accessibility" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-accessibility" class="category-progress-bar"></div></div>
          <div id="catCounts-accessibility" class="category-card-stats">--</div>
        </div></div>

        <div id="catCard-links" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">Link Graph Structure</span>
            <span id="catScore-links" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-links" class="category-progress-bar"></div></div>
          <div id="catCounts-links" class="category-card-stats">--</div>
        </div></div>

        <div id="catCard-seo" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">General SEO Health</span>
            <span id="catScore-seo" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-seo" class="category-progress-bar"></div></div>
          <div id="catCounts-seo" class="category-card-stats">--</div>
        </div></div>

        <div id="catCard-ai_visibility" class="db-outer"><div class="db-inner category-card">
          <div class="category-card-header">
            <span class="category-card-title">AI Visibility Score</span>
            <span id="catScore-ai_visibility" class="category-card-score">--</span>
          </div>
          <div class="category-progress-container"><div id="catProgress-ai_visibility" class="category-progress-bar"></div></div>
          <div id="catCounts-ai_visibility" class="category-card-stats">--</div>
        </div></div>
      </div>
    </div>

    <!-- ==========================================================================
         QUICK WINS SECTION
         ========================================================================== -->
    <section id="quickwins" class="section-title">
      ⚡ Quick Wins <span>High Impact, Low Effort</span>
    </section>

    <div class="dashboard-grid">
      <!-- Quick wins cards list -->
      <div class="col-8">
        <div id="quickWinsList" class="quick-wins-list">
          <!-- Populated by JavaScript -->
        </div>
      </div>

      <!-- Severity Breakdown stats widget -->
      <div class="col-4">
        <div class="db-outer" style="height: 100%;">
          <div class="db-inner severity-chart-container">
            <h3 style="color: var(--text-primary); font-size: 1rem; font-weight: 700; margin-bottom: 8px;">Severity Summary</h3>
            
            <div class="sev-bar-item">
              <div class="sev-bar-info">
                <span class="sev-bar-label text-rose">Critical</span>
                <span id="sevCountLabel-critical" class="font-mono text-rose">0</span>
              </div>
              <div class="sev-bar-track"><div id="sevBar-critical" class="sev-bar-fill bg-rose"></div></div>
            </div>

            <div class="sev-bar-item">
              <div class="sev-bar-info">
                <span class="sev-bar-label text-rose" style="color: #ef4444;">Errors</span>
                <span id="sevCountLabel-error" class="font-mono" style="color: #ef4444;">0</span>
              </div>
              <div class="sev-bar-track"><div id="sevBar-error" class="sev-bar-fill" style="background-color: #ef4444;"></div></div>
            </div>

            <div class="sev-bar-item">
              <div class="sev-bar-info">
                <span class="sev-bar-label text-amber">Warnings</span>
                <span id="sevCountLabel-warning" class="font-mono text-amber">0</span>
              </div>
              <div class="sev-bar-track"><div id="sevBar-warning" class="sev-bar-fill bg-amber"></div></div>
            </div>

            <div class="sev-bar-item">
              <div class="sev-bar-info">
                <span class="sev-bar-label text-blue">Info / Passed</span>
                <span id="sevCountLabel-info" class="font-mono text-blue">0</span>
              </div>
              <div class="sev-bar-track"><div id="sevBar-info" class="sev-bar-fill bg-blue"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         ISSUES HUB SECTION
         ========================================================================== -->
    <section id="issues" class="section-title">
      Issues Hub <span>Active Audit Findings</span>
    </section>

    <div class="issues-filter-bar">
      <div class="filter-tabs">
        <button class="filter-tab active" onclick="setSeverityFilter('all', this)">
          All <span id="badgeCount-all" class="tab-badge">0</span>
        </button>
        <button class="filter-tab" onclick="setSeverityFilter('critical', this)">
          Critical <span id="badgeCount-critical" class="tab-badge text-rose">0</span>
        </button>
        <button class="filter-tab" onclick="setSeverityFilter('error', this)">
          Errors <span id="badgeCount-error" class="tab-badge" style="color:#ef4444;">0</span>
        </button>
        <button class="filter-tab" onclick="setSeverityFilter('warning', this)">
          Warnings <span id="badgeCount-warning" class="tab-badge text-amber">0</span>
        </button>
        <button class="filter-tab" onclick="setSeverityFilter('info', this)">
          Info <span id="badgeCount-info" class="tab-badge text-blue">0</span>
        </button>
      </div>

      <div class="search-input-wrapper">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="issueSearchInput" type="text" class="search-input" placeholder="Search issues, rules, URLs..." oninput="handleIssueSearch()">
      </div>
    </div>

    <div id="findingsStack" class="findings-stack" style="margin-bottom: 64px;">
      <!-- Populated dynamically by JavaScript -->
    </div>

    <!-- ==========================================================================
         CRAWL TOPOLOGY SECTION (PAGINATED DIRECTORY)
         ========================================================================== -->
    <section id="topology" class="section-title">
      Crawl Topology <span>Internal Site Directory</span>
    </section>

    <div class="crawl-table-filters">
      <div class="filter-tabs" id="tableStatusTabs">
        <button class="filter-tab active" onclick="setTableStatusFilter('all', this)">All Pages</button>
        <button class="filter-tab" onclick="setTableStatusFilter('200', this)">200 OK</button>
        <button class="filter-tab" onclick="setTableStatusFilter('3xx', this)">3xx Redirects</button>
        <button class="filter-tab" onclick="setTableStatusFilter('4xx5xx', this)">4xx/5xx Errors</button>
      </div>

      <div class="search-input-wrapper">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="tableSearchInput" type="text" class="search-input" placeholder="Search URLs..." oninput="handleTableSearch()">
      </div>
    </div>

    <div class="table-container" style="margin-bottom: 64px;">
      <table id="crawlTable">
        <thead>
          <tr>
            <th>URL Path</th>
            <th>HTTP Status</th>
            <th style="text-align: center;">Depth</th>
            <th style="text-align: center;">In-Links</th>
            <th style="text-align: center;">Authority</th>
            <th style="text-align: center;">Performance</th>
          </tr>
        </thead>
        <tbody id="crawlTableBody">
          <!-- Populated dynamically -->
        </tbody>
      </table>
      <div class="pagination-bar">
        <span id="paginationInfo">Showing 0-0 of 0</span>
        <div class="pagination-actions">
          <button id="paginationPrevBtn" class="pagination-btn" onclick="prevTablePage()" disabled>Previous</button>
          <button id="paginationNextBtn" class="pagination-btn" onclick="nextTablePage()" disabled>Next</button>
        </div>
      </div>
    </div>

    <!-- ==========================================================================
         CATEGORY BREAKDOWN
         ========================================================================== -->
    <section id="categories" class="section-title">
      Category Breakdown <span>Structural Deep Dive</span>
    </section>

    <div id="categoryAccordion" class="category-accordion" style="margin-bottom: 64px;">
      <!-- Collapsible accordions populated by JavaScript -->
    </div>

    <!-- ==========================================================================
         ENGINE & AUDIT CONFIG STATS
         ========================================================================== -->
    <section id="engine" class="section-title">
      Engine Configuration <span>Audit Settings</span>
    </section>

    <div class="stats-info-grid">
      <div class="db-outer"><div class="db-inner">
        <h3 style="color: var(--text-primary); font-size: 1rem; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; font-family: var(--font-mono); font-size: 0.8rem; tracking-wider">Crawl Metrics</h3>
        <div class="info-list">
          <div class="info-item">
            <span class="info-lbl">Pages Audited</span>
            <span id="infoPages" class="info-val">--</span>
          </div>
          <div class="info-item">
            <span class="info-lbl">Total Time (Engine)</span>
            <span id="infoTime" class="info-val">--</span>
          </div>
          <div class="info-item">
            <span class="info-lbl">Max Depth Reached</span>
            <span id="infoDepth" class="info-val">--</span>
          </div>
          <div class="info-item">
            <span class="info-lbl">Orphan Pages Flagged</span>
            <span id="infoOrphans" class="info-val">--</span>
          </div>
        </div>
      </div></div>

      <div class="db-outer"><div class="db-inner">
        <h3 style="color: var(--text-primary); font-size: 1rem; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; font-family: var(--font-mono); font-size: 0.8rem; tracking-wider">Config Profile</h3>
        <div class="info-list">
          <div class="info-item">
            <span class="info-lbl">Preset Loaded</span>
            <span id="infoPreset" class="info-val">--</span>
          </div>
          <div class="info-item">
            <span class="info-lbl">Crawl Concurrency</span>
            <span id="infoConcurrency" class="info-val">--</span>
          </div>
          <div class="info-item">
            <span class="info-lbl">Rate Limiting (Delay)</span>
            <span id="infoDelay" class="info-val">--</span>
          </div>
          <div class="info-item">
            <span class="info-lbl">Headless Rendering</span>
            <span id="infoHeadless" class="info-val">--</span>
          </div>
        </div>
      </div></div>
    </div>

    <!-- ==========================================================================
         FOOTER
         ========================================================================== -->
    <footer>
      <div>Generated at <span id="footerTimestamp">--</span></div>
      <div>Compliance Engine: MIT &copy; 2026 SEOCore Platform</div>
    </footer>
  </main>

  <!-- ==========================================================================
       DYNAMIC DATA INJECTION CONTAINER & ENGINE LOGIC
       ========================================================================== -->
  <script>
    // Injected audit data fallback for offline double-click loading
    const defaultResult = {
      "url": "https://seocore.dev",
      "timestamp": "Saturday, May 23, 2026, 1:28 PM",
      "score": 87,
      "pagesAudited": 42,
      "totalLoadTimeMs": 2450,
      "config": {
        "preset": "standard",
        "concurrency": 5,
        "maxDepth": 3,
        "maxPages": 100,
        "rateLimitMs": 100,
        "playwrightEnabled": false
      },
      "categories": {
        "indexing": {
          "category": "indexing",
          "score": 92,
          "totalDeductions": 8,
          "findingsCount": { "critical": 0, "error": 1, "warning": 0, "info": 1 }
        },
        "metadata": {
          "category": "metadata",
          "score": 85,
          "totalDeductions": 15,
          "findingsCount": { "critical": 0, "error": 1, "warning": 2, "info": 0 }
        },
        "links": {
          "category": "links",
          "score": 70,
          "totalDeductions": 30,
          "findingsCount": { "critical": 1, "error": 1, "warning": 1, "info": 0 }
        },
        "performance": {
          "category": "performance",
          "score": 88,
          "totalDeductions": 12,
          "findingsCount": { "critical": 0, "error": 1, "warning": 1, "info": 0 }
        },
        "accessibility": {
          "category": "accessibility",
          "score": 95,
          "totalDeductions": 5,
          "findingsCount": { "critical": 0, "error": 0, "warning": 1, "info": 0 }
        },
        "seo": {
          "category": "seo",
          "score": 90,
          "totalDeductions": 10,
          "findingsCount": { "critical": 0, "error": 1, "warning": 0, "info": 0 }
        }
      },
      "findings": [
        {
          "id": "broken-internal-link:seocore.dev",
          "ruleId": "broken-internal-link",
          "severity": "critical",
          "category": "links",
          "url": "https://seocore.dev/blog/intro-to-seo-auditing",
          "message": "Broken internal link detected targeting non-existent resource",
          "recommendation": "Correct the internal anchor href to target a valid status 200 resource or remove the dead anchor.",
          "evidence": "Target URL: https://seocore.dev/assets/dl-v2.zip returned Status Code: 404 (Not Found)\\nFound in source code on line: 142 | <a href='/assets/dl-v2.zip'>Download Engine</a>"
        },
        {
          "id": "missing-meta-description:seocore.dev",
          "ruleId": "missing-meta-description",
          "severity": "error",
          "category": "metadata",
          "url": "https://seocore.dev/docs/getting-started",
          "message": "Critical missing meta description header tags",
          "recommendation": "Add a unique and descriptive <meta name='description' content='...'> element to the page header, constrained between 120 and 160 characters.",
          "evidence": "Header validation complete. Found: <title>Getting Started - SEOCore</title> | Missing: <meta name='description'>"
        },
        {
          "id": "slow-lcp:seocore.dev",
          "ruleId": "slow-lcp",
          "severity": "error",
          "category": "performance",
          "url": "https://seocore.dev/pricing",
          "message": "Largest Contentful Paint (LCP) performance budget breached",
          "recommendation": "Optimize hero images, implement lazy loading for below-the-fold media, and eliminate render-blocking stylesheet elements.",
          "evidence": "LCP Load Time: 3.12s (Maximum acceptable threshold is 2.5s for standard user experience score)"
        },
        {
          "id": "duplicate-h1:seocore.dev",
          "ruleId": "duplicate-h1",
          "severity": "warning",
          "category": "metadata",
          "url": "https://seocore.dev/enterprise",
          "message": "Multiple H1 headers detected in single document layout",
          "recommendation": "Ensure each document has exactly one primary H1 header mapping to the main topic, convert secondary headings to H2 tags.",
          "evidence": "Found 2 instances of H1: '1. SEOCore Enterprise Portal' and '2. Scalable Automated Crawling Engine'"
        },
        {
          "id": "missing-image-alt:seocore.dev",
          "ruleId": "missing-image-alt",
          "severity": "warning",
          "category": "accessibility",
          "url": "https://seocore.dev/about",
          "message": "Images found lacking screen-reader alternative tags (alt)",
          "recommendation": "Provide short, meaningful description tags inside the alt attribute for images to satisfy WCAG screen accessibility rules.",
          "evidence": "Found tag: <img src='/img/architects/sunny.jpg'> lacking alternative attribute on line 87."
        },
        {
          "id": "orphan-page:seocore.dev",
          "ruleId": "orphan-page",
          "severity": "info",
          "category": "indexing",
          "url": "https://seocore.dev/sandbox-landing",
          "message": "Orphan page discovered lacking any inbound links",
          "recommendation": "Integrate the URL into your main navigational layout, sitemap, or add internal href links to ensure proper indexing coverage.",
          "evidence": "Inbound edge score calculated: 0 in degree. Isolated node inside site graph."
        }
      ],
      "pages": {
        "https://seocore.dev": {
          "url": "https://seocore.dev",
          "statusCode": 200,
          "loadTimeMs": 120,
          "contentType": "text/html",
          "depth": 0,
          "inDegree": 14,
          "outDegree": 18,
          "authorityScore": 98,
          "performanceScore": 92
        },
        "https://seocore.dev/docs/getting-started": {
          "url": "https://seocore.dev/docs/getting-started",
          "statusCode": 200,
          "loadTimeMs": 210,
          "contentType": "text/html",
          "depth": 1,
          "inDegree": 8,
          "outDegree": 12,
          "authorityScore": 75,
          "performanceScore": 86
        },
        "https://seocore.dev/blog/intro-to-seo-auditing": {
          "url": "https://seocore.dev/blog/intro-to-seo-auditing",
          "statusCode": 200,
          "loadTimeMs": 185,
          "contentType": "text/html",
          "depth": 2,
          "inDegree": 3,
          "outDegree": 5,
          "authorityScore": 45,
          "performanceScore": 90
        },
        "https://seocore.dev/pricing": {
          "url": "https://seocore.dev/pricing",
          "statusCode": 200,
          "loadTimeMs": 520,
          "contentType": "text/html",
          "depth": 1,
          "inDegree": 6,
          "outDegree": 4,
          "authorityScore": 60,
          "performanceScore": 48
        },
        "https://seocore.dev/old-resources/doc-redirect": {
          "url": "https://seocore.dev/old-resources/doc-redirect",
          "statusCode": 301,
          "loadTimeMs": 80,
          "contentType": "text/html",
          "depth": 2,
          "inDegree": 1,
          "outDegree": 1,
          "authorityScore": 12,
          "performanceScore": 99
        },
        "https://seocore.dev/dead-page": {
          "url": "https://seocore.dev/dead-page",
          "statusCode": 404,
          "loadTimeMs": 150,
          "contentType": "text/html",
          "depth": 1,
          "inDegree": 2,
          "outDegree": 0,
          "authorityScore": 8,
          "performanceScore": 100
        },
        "https://seocore.dev/sandbox-landing": {
          "url": "https://seocore.dev/sandbox-landing",
          "statusCode": 200,
          "loadTimeMs": 140,
          "contentType": "text/html",
          "depth": 3,
          "inDegree": 0,
          "outDegree": 2,
          "authorityScore": 1,
          "performanceScore": 95,
          "isOrphan": true
        }
      },
      "crawlGraph": {
        "metrics": {
          "maxDepth": 3,
          "orphanCount": 1
        }
      }
    };

    // Global controller storage holding the parsed dataset
    let activeResult = defaultResult;

    // Checks for injected JSON. Replaced during compile or load
    window.__SEO_AUDIT_DATA__;
    const injectedData = window.__SEO_AUDIT_DATA__;
    if (injectedData && Object.keys(injectedData).length > 0) {
      activeResult = injectedData;
    }

    // Interactive Controller States
    let currentSeverityFilter = 'all';
    let currentIssueSearch = '';
    let currentTableSearch = '';
    let currentTableStatusFilter = 'all';
    let currentTablePage = 1;
    const itemsPerTablePage = 10;

    // ==========================================================================
    // INITIALIZATION PIPELINE
    // ==========================================================================
    window.addEventListener('DOMContentLoaded', function() {
      buildDashboard(activeResult);
      setupIntersectionObserver();
    });

    function buildDashboard(result) {
      // Core Header
      document.title = 'SEOCore Audit - ' + result.url;
      const targetUrlLink = document.getElementById('targetUrlLink');
      targetUrlLink.innerText = result.url;
      targetUrlLink.href = result.url;

      // Overall Score dial
      renderOverallScore(result.score);

      // Raw Stats Counters
      document.getElementById('statPages').innerText = result.pagesAudited;
      document.getElementById('statTime').innerText = (result.totalLoadTimeMs / 1000).toFixed(2);

      // Extract Findings Severities
      const totalCritical = result.findings.filter(function(f) { return f.severity === 'critical'; }).length;
      const totalError = result.findings.filter(function(f) { return f.severity === 'error'; }).length;
      const totalWarning = result.findings.filter(function(f) { return f.severity === 'warning'; }).length;
      const totalInfo = result.findings.filter(function(f) { return f.severity === 'info'; }).length;

      document.getElementById('statCritical').innerText = totalCritical;
      document.getElementById('statError').innerText = totalError;
      document.getElementById('statWarning').innerText = totalWarning;

      // Severity Distribution metrics and Bars
      const maxCount = Math.max(totalCritical, totalError, totalWarning, totalInfo, 1);
      
      updateSeverityMetric('critical', totalCritical, maxCount);
      updateSeverityMetric('error', totalError, maxCount);
      updateSeverityMetric('warning', totalWarning, maxCount);
      updateSeverityMetric('info', totalInfo, maxCount);

      // Category cards
      renderCategoryCards(result.categories);

      // Quick Wins
      renderQuickWins(result.findings);

      // Filter counters
      document.getElementById('badgeCount-all').innerText = result.findings.length;
      document.getElementById('badgeCount-critical').innerText = totalCritical;
      document.getElementById('badgeCount-error').innerText = totalError;
      document.getElementById('badgeCount-warning').innerText = totalWarning;
      document.getElementById('badgeCount-info').innerText = totalInfo;

      // Render default lists
      updateFindingsList();
      updateCrawlTable();
      renderCategoryAccordion(result.categories, result.findings);

      // Config and System Details
      document.getElementById('infoPages').innerText = result.pagesAudited;
      document.getElementById('infoTime').innerText = result.totalLoadTimeMs + ' ms';
      document.getElementById('infoDepth').innerText = result.crawlGraph?.metrics?.maxDepth ?? result.config?.maxDepth ?? 'N/A';
      document.getElementById('infoOrphans').innerText = result.crawlGraph?.metrics?.orphanCount ?? '0';

      document.getElementById('infoPreset').innerText = result.config?.preset ?? 'Standard';
      document.getElementById('infoConcurrency').innerText = result.config?.concurrency ?? '5';
      document.getElementById('infoDelay').innerText = (result.config?.rateLimitMs ?? 100) + ' ms';
      document.getElementById('infoHeadless').innerText = result.config?.playwrightEnabled ? 'Enabled' : 'Disabled (Cheerio)';

      document.getElementById('footerTimestamp').innerText = result.timestamp;
    }

    // ==========================================================================
    // INTERACTIVE SUB-RENDERING FUNCTIONS
    // ==========================================================================
    function renderOverallScore(score) {
      const numberEl = document.getElementById('scoreNumber');
      const badgeEl = document.getElementById('scoreStatusBadge');
      const circleEl = document.getElementById('scoreProgressRing');

      // Animating overall Counter
      let count = 0;
      const duration = 800;
      const stepTime = Math.abs(Math.floor(duration / score));
      const timer = setInterval(function() {
        count += 1;
        numberEl.innerText = count;
        if (count >= score) {
          clearInterval(timer);
          numberEl.innerText = score;
        }
      }, stepTime || 1);

      // Stroke dash calculations: Radius 70 -> Circumference = 2 * PI * 70 = 439.8
      const strokeCircumference = 439.8;
      const offset = strokeCircumference - (score / 100) * strokeCircumference;
      circleEl.style.strokeDashoffset = offset;

      // State colors
      if (score >= 90) {
        circleEl.setAttribute('stroke', 'var(--color-emerald)');
        badgeEl.className = 'score-status-badge bg-emerald';
        badgeEl.innerText = 'EXCELLENT';
      } else if (score >= 50) {
        circleEl.setAttribute('stroke', 'var(--color-amber)');
        badgeEl.className = 'score-status-badge bg-amber';
        badgeEl.innerText = 'NEEDS WORK';
      } else {
        circleEl.setAttribute('stroke', 'var(--color-rose)');
        badgeEl.className = 'score-status-badge bg-rose';
        badgeEl.innerText = 'CRITICAL HEALTH';
      }
    }

    function updateSeverityMetric(sev, count, max) {
      document.getElementById('sevCountLabel-' + sev).innerText = count;
      const percentage = (count / max) * 100;
      // Add slight delay for animation feel
      setTimeout(function() {
        document.getElementById('sevBar-' + sev).style.width = percentage + '%';
      }, 100);
    }

    function renderCategoryCards(categories) {
      Object.keys(categories).forEach(function(catId) {
        const cat = categories[catId];
        const scoreEl = document.getElementById('catScore-' + catId);
        const progressEl = document.getElementById('catProgress-' + catId);
        const countsEl = document.getElementById('catCounts-' + catId);

        if (!scoreEl) return;

        scoreEl.innerText = cat.score + '%';
        
        // Severity theme class
        let colorClass = 'bg-emerald';
        if (cat.score < 50) {
          colorClass = 'bg-rose';
          scoreEl.className = 'category-card-score text-rose';
        } else if (cat.score < 90) {
          colorClass = 'bg-amber';
          scoreEl.className = 'category-card-score text-amber';
        } else {
          scoreEl.className = 'category-card-score text-emerald';
        }

        // Fill bar with delay
        setTimeout(function() {
          progressEl.style.width = cat.score + '%';
          progressEl.className = 'category-progress-bar ' + colorClass;
        }, 200);

        // Sub findings counters inside cards
        countsEl.innerHTML = 
          '<span class="category-stat-dot"><span class="bg-rose"></span>' + (cat.findingsCount.critical + cat.findingsCount.error) + '</span>' +
          '<span class="category-stat-dot"><span class="bg-amber"></span>' + cat.findingsCount.warning + '</span>' +
          '<span class="category-stat-dot"><span class="bg-blue"></span>' + cat.findingsCount.info + '</span>';
      });
    }

    function renderQuickWins(findings) {
      const container = document.getElementById('quickWinsList');
      container.innerHTML = '';

      // Define Quick wins: Critical or Error findings
      const wins = findings.filter(function(f) {
        return f.severity === 'critical' || f.severity === 'error';
      }).slice(0, 4);

      if (wins.length === 0) {
        container.innerHTML = 
          '<div class="quick-win-item" style="border-left-color: var(--color-emerald);">' +
            '<div class="quick-win-icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg></div>' +
            '<div class="quick-win-details">' +
              '<div class="quick-win-title">Absolute Perfection Achieved</div>' +
              '<div class="quick-win-rec">No critical or error issues detected. Website graph meets all main health checks!</div>' +
            '</div>' +
          '</div>';
        return;
      }

      wins.forEach(function(win) {
        const item = document.createElement('div');
        item.className = 'quick-win-item';
        item.innerHTML = 
          '<div class="quick-win-icon">' +
            '<svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' +
          '</div>' +
          '<div class="quick-win-details">' +
            '<div class="quick-win-title">' + escapeHtml(win.message) + '</div>' +
            '<div class="quick-win-rec"><strong style="color: var(--color-emerald);">Action:</strong> ' + escapeHtml(win.recommendation) + '</div>' +
            '<span class="quick-win-url">' + escapeHtml(win.url) + '</span>' +
          '</div>';
        container.appendChild(item);
      });
    }

    // ==========================================================================
    // SEVERITY FILTERS & SEARCH (ISSUES HUB)
    // ==========================================================================
    function setSeverityFilter(sev, button) {
      currentSeverityFilter = sev;
      
      // Update UI active state
      const tabs = button.parentNode.querySelectorAll('.filter-tab');
      tabs.forEach(function(t) { t.classList.remove('active'); });
      button.classList.add('active');

      updateFindingsList();
    }

    function handleIssueSearch() {
      currentIssueSearch = document.getElementById('issueSearchInput').value.toLowerCase();
      updateFindingsList();
    }

    function updateFindingsList() {
      const container = document.getElementById('findingsStack');
      container.innerHTML = '';

      const filtered = activeResult.findings.filter(function(f) {
        // Severity match
        if (currentSeverityFilter !== 'all' && f.severity !== currentSeverityFilter) return false;
        
        // Search query match
        if (currentIssueSearch) {
          const matchMsg = f.message.toLowerCase().includes(currentIssueSearch);
          const matchRule = f.ruleId.toLowerCase().includes(currentIssueSearch);
          const matchUrl = f.url.toLowerCase().includes(currentIssueSearch);
          const matchRec = f.recommendation.toLowerCase().includes(currentIssueSearch);
          return matchMsg || matchRule || matchUrl || matchRec;
        }

        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = 
          '<div style="text-align: center; padding: 48px; border: 1px solid var(--border-card); border-radius: 12px; background: var(--bg-card);">' +
            '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom: 12px;">' +
              '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>' +
            '</svg>' +
            '<div style="color: var(--text-primary); font-weight: 600; margin-bottom: 4px;">No matching findings found</div>' +
            '<div style="font-size: 0.85rem; color: var(--text-muted);">Adjust filters or verify the search queries.</div>' +
          '</div>';
        return;
      }

      filtered.forEach(function(f) {
        const card = document.createElement('div');
        card.id = 'finding-card-' + f.id;
        card.className = 'finding-card';

        let badgeClass = '';
        if (f.severity === 'critical') badgeClass = 'bg-rose';
        else if (f.severity === 'error') badgeClass = 'badge'; // will handle custom style below
        else if (f.severity === 'warning') badgeClass = 'bg-amber';
        else badgeClass = 'bg-blue';

        // Direct style for normal standard error badge
        const errorBadgeStyle = f.severity === 'error' ? 'style="background-color: #ef4444; color: #450a0a;"' : '';

        let html = 
          "<div class=\\\"finding-card-header\\\" onclick=\\\"toggleFindingExpansion('" + f.id + "')\\\">" +
            '<svg class="finding-chevron" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>' +
            '<span class="badge ' + badgeClass + '" ' + errorBadgeStyle + '>' + f.severity + '</span>' +
            '<span class="finding-title">' + escapeHtml(f.message) + '</span>' +
            '<span class="finding-category-badge">' + f.category + '</span>' +
          '</div>' +
          '<div class="finding-card-details">' +
            '<div class="finding-details-inner">' +
              '<div class="finding-detail-grid">' +
                '<div class="finding-detail-lbl">Affected URL</div>' +
                '<div class="finding-detail-val" style="font-family: var(--font-mono); word-break: break-all;">' +
                  '<a href="' + f.url + '" target="_blank" style="color: var(--color-blue); text-decoration: none;">' + escapeHtml(f.url) + '</a>' +
                '</div>' +
                '<div class="finding-detail-lbl">Rule Identifier</div>' +
                '<div class="finding-detail-val" style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">' + f.ruleId + '</div>';

        if (f.evidence) {
          html += 
                '<div class="finding-detail-lbl">Evidence</div>' +
                '<div class="finding-detail-val">' +
                  '<pre class="finding-code-evidence">' + escapeHtml(f.evidence) + '</pre>' +
                '</div>';
        }

        html += 
              '</div>' +
              '<div class="finding-action-card">' +
                '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>' +
                '<div class="finding-action-text">' +
                  '<strong>Suggested Action:</strong> ' + escapeHtml(f.recommendation) +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

        card.innerHTML = html;
        container.appendChild(card);
      });
    }

    function toggleFindingExpansion(id) {
      const card = document.getElementById('finding-card-' + id);
      const details = card.querySelector('.finding-card-details');

      if (card.classList.contains('expanded')) {
        details.style.maxHeight = '0';
        card.classList.remove('expanded');
      } else {
        // Set maximum height calculated
        details.style.maxHeight = details.scrollHeight + 'px';
        card.classList.add('expanded');
      }
    }

    // ==========================================================================
    // CRAWLED DIRECTORY PAGINATED TABLE CONTROLS
    // ==========================================================================
    function setTableStatusFilter(status, button) {
      currentTableStatusFilter = status;
      const tabs = button.parentNode.querySelectorAll('.filter-tab');
      tabs.forEach(function(t) { t.classList.remove('active'); });
      button.classList.add('active');

      currentTablePage = 1;
      updateCrawlTable();
    }

    function handleTableSearch() {
      currentTableSearch = document.getElementById('tableSearchInput').value.toLowerCase();
      currentTablePage = 1;
      updateCrawlTable();
    }

    function updateCrawlTable() {
      const tbody = document.getElementById('crawlTableBody');
      tbody.innerHTML = '';

      const pagesList = Object.values(activeResult.pages);

      const filtered = pagesList.filter(function(p) {
        // Status filter
        if (currentTableStatusFilter === '200' && p.statusCode !== 200) return false;
        if (currentTableStatusFilter === '3xx') {
          if (p.statusCode < 300 || p.statusCode >= 400) return false;
        }
        if (currentTableStatusFilter === '4xx5xx' && p.statusCode < 400) return false;

        // Search text
        if (currentTableSearch && !p.url.toLowerCase().includes(currentTableSearch)) return false;

        return true;
      });

      // Pagination indices
      const totalCount = filtered.length;
      const maxPages = Math.ceil(totalCount / itemsPerTablePage) || 1;
      
      if (currentTablePage > maxPages) currentTablePage = maxPages;

      const startIndex = (currentTablePage - 1) * itemsPerTablePage;
      const endIndex = Math.min(startIndex + itemsPerTablePage, totalCount);

      const pageSlice = filtered.slice(startIndex, endIndex);

      // Pagination indicators
      const paginationInfo = document.getElementById('paginationInfo');
      paginationInfo.innerText = totalCount > 0 ? ('Showing ' + (startIndex + 1) + '-' + endIndex + ' of ' + totalCount) : 'Showing 0-0 of 0';

      document.getElementById('paginationPrevBtn').disabled = currentTablePage === 1;
      document.getElementById('paginationNextBtn').disabled = currentTablePage === maxPages;

      if (pageSlice.length === 0) {
        tbody.innerHTML = 
          '<tr>' +
            '<td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">' +
              'No crawl directory items found matching active criteria.' +
            '</td>' +
          '</tr>';
        return;
      }

      pageSlice.forEach(function(p) {
        // Status Badge Style
        let statusClass = 'status-code-200';
        if (p.statusCode >= 400) statusClass = 'status-code-400';
        else if (p.statusCode >= 300) statusClass = 'status-code-300';

        // Render Performance
        let perfVal = 'N/A';
        let perfClass = 'text-muted';
        if (p.performanceScore !== undefined && p.performanceScore !== null) {
          perfVal = p.performanceScore;
          if (p.performanceScore >= 90) perfClass = 'text-emerald table-score-badge';
          else if (p.performanceScore >= 50) perfClass = 'text-amber table-score-badge';
          else perfClass = 'text-rose table-score-badge';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = 
          '<td class="table-url-cell">' +
            '<a href="' + p.url + '" target="_blank">' + escapeHtml(p.url) + '</a>' +
            (p.isOrphan ? '<span class="table-badge-orphan">Orphan</span>' : '') +
          '</td>' +
          '<td>' +
            '<span class="status-code-badge ' + statusClass + '">' + (p.statusCode || 'CANCELED') + '</span>' +
          '</td>' +
          '<td style="text-align: center; font-family: var(--font-mono);">' + (p.depth !== undefined ? p.depth : '-') + '</td>' +
          '<td style="text-align: center; font-family: var(--font-mono);">' + (p.inDegree !== undefined ? p.inDegree : '-') + '</td>' +
          '<td style="text-align: center; font-family: var(--font-mono); color: var(--color-amber); font-weight: 700;">' + (p.authorityScore !== undefined ? p.authorityScore : '-') + '</td>' +
          '<td style="text-align: center; font-family: var(--font-mono);" class="' + perfClass + '">' + perfVal + '</td>';
        tbody.appendChild(tr);
      });
    }

    function prevTablePage() {
      if (currentTablePage > 1) {
        currentTablePage -= 1;
        updateCrawlTable();
      }
    }

    function nextTablePage() {
      const filteredCount = Object.values(activeResult.pages).length; // approximate limit
      const maxPages = Math.ceil(filteredCount / itemsPerTablePage);
      if (currentTablePage < maxPages) {
        currentTablePage += 1;
        updateCrawlTable();
      }
    }

    // ==========================================================================
    // COLLAPSIBLE CATEGORIES ACCORDION
    // ==========================================================================
    function renderCategoryAccordion(categories, findings) {
      const container = document.getElementById('categoryAccordion');
      container.innerHTML = '';

      Object.keys(categories).forEach(function(catId) {
        const cat = categories[catId];
        const catFindings = findings.filter(function(f) { return f.category === catId; });

        const accordion = document.createElement('div');
        accordion.id = 'cat-accordion-' + catId;
        accordion.className = 'cat-accordion-item';

        // Score theme
        let scoreColorClass = 'text-emerald';
        if (cat.score < 50) scoreColorClass = 'text-rose';
        else if (cat.score < 90) scoreColorClass = 'text-amber';

        // SVG Icons per category
        let iconSvg = '';
        if (catId === 'indexing') {
          iconSvg = '<svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>';
        } else if (catId === 'metadata') {
          iconSvg = '<svg viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>';
        } else if (catId === 'performance') {
          iconSvg = '<svg viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>';
        } else if (catId === 'accessibility') {
          iconSvg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>';
        } else if (catId === 'links') {
          iconSvg = '<svg viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>';
        } else if (catId === 'ai_visibility') {
          iconSvg = '<svg viewBox="0 0 24 24"><path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/></svg>';
        } else {
          iconSvg = '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>';
        }

        let detailHtml = '';
        if (catFindings.length === 0) {
          detailHtml = 
            '<div class="cat-passed-state">' +
              '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>' +
              '<div>' +
                '<strong>Passed Check</strong>: No issues detected under this structural optimization module. Nice work!' +
              '</div>' +
            '</div>';
        } else {
          detailHtml = '<div class="findings-stack">';
          catFindings.forEach(function(f) {
            var sevClass = '';
            if (f.severity === 'critical') sevClass = 'bg-rose';
            else if (f.severity === 'error') sevClass = 'badge';
            else if (f.severity === 'warning') sevClass = 'bg-amber';
            else sevClass = 'bg-blue';

            var inlineErrorStyle = f.severity === 'error' ? 'style="background-color: #ef4444; color: #450a0a;"' : '';

            var itemHtml = 
              '<div class="finding-card" id="cat-finding-card-' + f.id + '">' +
                "<div class=\\\"finding-card-header\\\" onclick=\\\"event.stopPropagation(); toggleCatFindingExpansion('" + f.id + "')\\\">" +
                  '<svg class="finding-chevron" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>' +
                  '<span class="badge ' + sevClass + '" ' + inlineErrorStyle + '>' + f.severity + '</span>' +
                  '<span class="finding-title" style="font-size: 0.9rem;">' + escapeHtml(f.message) + '</span>' +
                '</div>' +
                '<div class="finding-card-details">' +
                  '<div class="finding-details-inner" style="background: rgba(0, 0, 0, 0.25);">' +
                    '<div class="finding-detail-grid">' +
                      '<div class="finding-detail-lbl">URL</div>' +
                      '<div class="finding-detail-val" style="font-family: var(--font-mono); font-size: 0.8rem; word-break: break-all;">' +
                        '<a href="' + f.url + '" target="_blank" style="color: var(--color-blue); text-decoration: none;">' + escapeHtml(f.url) + '</a>' +
                      '</div>';

            if (f.evidence) {
              itemHtml += 
                      '<div class="finding-detail-lbl">Evidence</div>' +
                      '<div class="finding-detail-val">' +
                        '<pre class="finding-code-evidence" style="font-size: 0.75rem;">' + escapeHtml(f.evidence) + '</pre>' +
                      '</div>';
            }

            itemHtml += 
                    '</div>' +
                    '<div class="finding-action-card">' +
                      '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>' +
                      '<div class="finding-action-text" style="font-size: 0.8rem;">' +
                        '<strong>Fix:</strong> ' + escapeHtml(f.recommendation) +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>';
            detailHtml += itemHtml;
          });
          detailHtml += '</div>';
        }

        accordion.innerHTML = 
          "<div class=\\\"cat-accordion-header\\\" onclick=\\\"toggleCategoryExpansion('" + catId + "')\\\">" +
            '<span class="cat-accordion-title">' +
              iconSvg +
              ' ' + catId + ' Issues Summary' +
            '</span>' +
            '<div class="cat-accordion-meta">' +
              '<span class="cat-accordion-score ' + scoreColorClass + '">' + cat.score + '% Health</span>' +
              '<svg class="finding-chevron" viewBox="0 0 24 24" style="stroke: var(--text-muted);"><path d="M9 5l7 7-7 7"/></svg>' +
            '</div>' +
          '</div>' +
          '<div class="cat-accordion-details">' +
            '<div class="cat-accordion-inner">' +
              detailHtml +
            '</div>' +
          '</div>';

        container.appendChild(accordion);
      });
    }

    function toggleCategoryExpansion(catId) {
      var item = document.getElementById('cat-accordion-' + catId);
      var details = item.querySelector('.cat-accordion-details');

      if (item.classList.contains('expanded')) {
        details.style.maxHeight = '0';
        item.classList.remove('expanded');
      } else {
        details.style.maxHeight = 'fit-content';
        details.style.maxHeight = (details.scrollHeight + 100) + 'px';
        item.classList.add('expanded');
      }
    }

    function toggleCatFindingExpansion(id) {
      var card = document.getElementById('cat-finding-card-' + id);
      var details = card.querySelector('.finding-card-details');

      if (card.classList.contains('expanded')) {
        details.style.maxHeight = '0';
        card.classList.remove('expanded');
      } else {
        details.style.maxHeight = details.scrollHeight + 'px';
        card.classList.add('expanded');
        
        var parentAccordion = card.closest('.cat-accordion-details');
        if (parentAccordion) {
          parentAccordion.style.maxHeight = 'fit-content';
          parentAccordion.style.maxHeight = (parentAccordion.scrollHeight + details.scrollHeight) + 'px';
        }
      }
    }

    // ==========================================================================
    // UTILITY HELPER FUNCTIONS
    // ==========================================================================
    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function setActiveLink(element) {
      const links = document.querySelectorAll('.nav-link');
      links.forEach(function(l) { l.classList.remove('active'); });
      element.classList.add('active');
    }

    function exportResult() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeResult, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      
      const domain = activeResult.url.replace(/https?:\\/\\//, '').replace(/\\/.*$/, '');
      downloadAnchor.setAttribute("download", 'seocore-audit-' + domain + '.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    function setupIntersectionObserver() {
      // Intersection Observer for scroll entrance animations (Smooth heavy fade-ups)
      const animatedCards = document.querySelectorAll('.db-outer, .finding-card, .cat-accordion-item');
      
      if (!window.IntersectionObserver) {
        animatedCards.forEach(function(card) {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });
        return;
      }

      const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.05
      };

      const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      }, observerOptions);

      animatedCards.forEach(function(card) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(24px)';
        card.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
        observer.observe(card);
      });

      // Safeguard: force visible after 1s in case of slow or blocked observer trigger
      setTimeout(function() {
        animatedCards.forEach(function(card) {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        });
      }, 1000);
    }
  </script>
</body>
</html>
`;
