import { OpportunitiesResult, SearchOpportunity } from '@seocore/analyzers';

export function generateHtmlReport(result: OpportunitiesResult): string {
  const { url, generatedAt, dataSource, enrichedPages, scannedPages, opportunities, summary } = result;

  const priorityBadge = (p: 'high' | 'medium' | 'low') => {
    const bg = p === 'high' ? '#fee2e2' : p === 'medium' ? '#fef3c7' : '#f3f4f6';
    const text = p === 'high' ? '#991b1b' : p === 'medium' ? '#92400e' : '#374151';
    const label = p.toUpperCase();
    return `<span style="background-color: ${bg}; color: ${text}; padding: 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 600; border-radius: 0.25rem;">${label}</span>`;
  };

  const typeLabel = (t: string) => {
    return t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const opportunitiesHtml = opportunities.map(opp => {
    const actionsHtml = opp.recommendedActions.map(act => `<li>${escapeHtml(act)}</li>`).join('');
    const signalsHtml = opp.sourceSignals.map(sig => `<li>${escapeHtml(sig)}</li>`).join('');
    
    const metricsHtml = Object.entries(opp.supportingMetrics).map(([k, v]) => {
      return `<div style="background-color: #f9fafb; padding: 0.5rem; border-radius: 0.25rem; font-size: 0.875rem;">
        <span style="color: #6b7280; font-weight: 500; font-size: 0.75rem; text-transform: uppercase;">${escapeHtml(k)}</span>
        <div style="font-weight: 600; color: #111827;">${escapeHtml(String(v))}</div>
      </div>`;
    }).join('');

    return `
      <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;">
          <div>
            <div style="font-size: 0.75rem; font-weight: 600; color: #4f46e5; text-transform: uppercase; margin-bottom: 0.25rem;">${escapeHtml(typeLabel(opp.type))}</div>
            <h3 style="font-size: 1.125rem; font-weight: 700; color: #111827; margin: 0 0 0.25rem 0; word-break: break-all;">${escapeHtml(opp.url)}</h3>
            ${opp.title ? `<div style="font-size: 0.875rem; color: #4b5563; font-style: italic; margin-bottom: 0.5rem;">Title: "${escapeHtml(opp.title)}"</div>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.875rem; font-weight: 600; color: #374151; background-color: #e0e7ff; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">Score: ${opp.score}</span>
            ${priorityBadge(opp.priority)}
          </div>
        </div>

        <p style="color: #374151; font-size: 0.95rem; margin: 0 0 1rem 0; line-height: 1.5;">${escapeHtml(opp.reason)}</p>

        ${metricsHtml ? `
        <div style="margin-bottom: 1rem;">
          <h4 style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 700; margin-bottom: 0.5rem;">Supporting Metrics</h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.5rem;">
            ${metricsHtml}
          </div>
        </div>
        ` : ''}

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-top: 1rem; border-top: 1px solid #f3f4f6; padding-top: 1rem;">
          <div>
            <h4 style="font-size: 0.875rem; font-weight: 700; color: #065f46; margin: 0 0 0.5rem 0;">Recommended Actions</h4>
            <ul style="margin: 0; padding-left: 1.25rem; color: #047857; font-size: 0.875rem; line-height: 1.5;">
              ${actionsHtml}
            </ul>
          </div>
          <div>
            <h4 style="font-size: 0.875rem; font-weight: 700; color: #374151; margin: 0 0 0.5rem 0;">Source Signals</h4>
            <ul style="margin: 0; padding-left: 1.25rem; color: #4b5563; font-size: 0.825rem; line-height: 1.5;">
              ${signalsHtml}
            </ul>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SEO Search Opportunities - Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2937;
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    .header {
      background-color: white;
      border-radius: 0.5rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h1 style="margin: 0 0 0.5rem 0; font-size: 2.25rem; font-weight: 800; color: #111827;">Search Opportunities Report</h1>
          <p style="margin: 0; color: #6b7280; font-size: 1rem;">Crawl analysis starting point: <a href="${escapeHtml(url)}" target="_blank" style="color: #4f46e5; font-weight: 600;">${escapeHtml(url)}</a></p>
        </div>
        <div style="background-color: #f3f4f6; padding: 1rem; border-radius: 0.5rem; font-size: 0.875rem; text-align: right;">
          <div><strong>Generated:</strong> ${escapeHtml(new Date(generatedAt).toLocaleString())}</div>
          <div><strong>Data Source:</strong> <span style="text-transform: uppercase; font-weight: 700; color: #4f46e5;">${escapeHtml(dataSource)}</span></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; border-top: 1px solid #e5e7eb; padding-top: 1.5rem;">
        <div style="text-align: center;">
          <div style="font-size: 2rem; font-weight: 800; color: #dc2626;">${summary.high}</div>
          <div style="color: #4b5563; font-weight: 600; font-size: 0.875rem;">HIGH PRIORITY</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 2rem; font-weight: 800; color: #d97706;">${summary.medium}</div>
          <div style="color: #4b5563; font-weight: 600; font-size: 0.875rem;">MEDIUM PRIORITY</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 2rem; font-weight: 800; color: #4b5563;">${summary.low}</div>
          <div style="color: #4b5563; font-weight: 600; font-size: 0.875rem;">LOW PRIORITY</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 2rem; font-weight: 800; color: #10b981;">${enrichedPages}/${scannedPages}</div>
          <div style="color: #4b5563; font-weight: 600; font-size: 0.875rem;">ENRICHED PAGES</div>
        </div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <h2 style="font-size: 1.5rem; font-weight: 700; color: #111827; margin: 0 0 0.5rem 0;">Prioritized Action Plan (${opportunities.length})</h2>
      ${opportunitiesHtml || '<p style="background-color: white; padding: 2rem; text-align: center; border-radius: 0.5rem; color: #6b7280;">No opportunities identified.</p>'}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
