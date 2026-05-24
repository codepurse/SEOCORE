
import * as fs from 'fs';
import * as path from 'path';

// Create mock audit result 1
const mockAudit1 = {
  url: 'https://example.com',
  timestamp: new Date().toISOString(),
  config: {},
  score: 85,
  categories: {
    indexing: { category: 'indexing', score: 90, totalDeductions: 10, findingsCount: { critical: 0, error: 1, warning: 2, info: 0 } },
    metadata: { category: 'metadata', score: 80, totalDeductions: 20, findingsCount: { critical: 0, error: 1, warning: 1, info: 0 } },
    links: { category: 'links', score: 85, totalDeductions: 15, findingsCount: { critical: 0, error: 0, warning: 3, info: 0 } },
    seo: { category: 'seo', score: 90, totalDeductions: 10, findingsCount: { critical: 0, error: 0, warning: 2, info: 0 } },
    ai_visibility: { category: 'ai_visibility', score: 88, totalDeductions: 12, findingsCount: { critical: 0, error: 0, warning: 2, info: 0 } },
    accessibility: { category: 'accessibility', score: 82, totalDeductions: 18, findingsCount: { critical: 0, error: 1, warning: 2, info: 0 } },
    performance: { category: 'performance', score: 86, totalDeductions: 14, findingsCount: { critical: 0, error: 0, warning: 3, info: 0 } },
    mobile_seo: { category: 'mobile_seo', score: 84, totalDeductions: 16, findingsCount: { critical: 0, error: 1, warning: 1, info: 0 } },
    backlink_intelligence: { category: 'backlink_intelligence', score: 75, totalDeductions: 25, findingsCount: { critical: 1, error: 1, warning: 2, info: 0 } }
  },
  findings: [
    {
      id: 'test1',
      ruleId: 'test-rule-1',
      severity: 'error',
      category: 'metadata',
      url: 'https://example.com',
      message: 'Meta description is too short',
      recommendation: 'Increase meta description to 150-160 characters'
    },
    {
      id: 'test2',
      ruleId: 'test-rule-2',
      severity: 'critical',
      category: 'backlink_intelligence',
      url: 'https://example.com',
      message: 'No backlink data available',
      recommendation: 'Configure backlink provider'
    }
  ],
  pagesAudited: 5,
  totalLoadTimeMs: 2500,
  pages: {},
  crawlGraph: {
    nodes: [],
    edges: [],
    metrics: {
      maxDepth: 3,
      orphanCount: 0,
      hubPages: [],
      authorityNodes: []
    }
  }
};

// Create mock audit result 2
const mockAudit2 = {
  url: 'https://example.org',
  timestamp: new Date().toISOString(),
  config: {},
  score: 72,
  categories: {
    indexing: { category: 'indexing', score: 65, totalDeductions: 35, findingsCount: { critical: 1, error: 2, warning: 3, info: 0 } },
    metadata: { category: 'metadata', score: 70, totalDeductions: 30, findingsCount: { critical: 0, error: 2, warning: 2, info: 0 } },
    links: { category: 'links', score: 75, totalDeductions: 25, findingsCount: { critical: 0, error: 1, warning: 4, info: 0 } },
    seo: { category: 'seo', score: 78, totalDeductions: 22, findingsCount: { critical: 0, error: 1, warning: 3, info: 0 } },
    ai_visibility: { category: 'ai_visibility', score: 68, totalDeductions: 32, findingsCount: { critical: 1, error: 1, warning: 3, info: 0 } },
    accessibility: { category: 'accessibility', score: 70, totalDeductions: 30, findingsCount: { critical: 1, error: 2, warning: 2, info: 0 } },
    performance: { category: 'performance', score: 72, totalDeductions: 28, findingsCount: { critical: 0, error: 2, warning: 3, info: 0 } },
    mobile_seo: { category: 'mobile_seo', score: 69, totalDeductions: 31, findingsCount: { critical: 1, error: 2, warning: 1, info: 0 } },
    backlink_intelligence: { category: 'backlink_intelligence', score: 80, totalDeductions: 20, findingsCount: { critical: 0, error: 1, warning: 2, info: 0 } }
  },
  findings: [
    {
      id: 'test3',
      ruleId: 'test-rule-3',
      severity: 'critical',
      category: 'indexing',
      url: 'https://example.org',
      message: 'No sitemap found',
      recommendation: 'Create and submit a sitemap.xml'
    },
    {
      id: 'test4',
      ruleId: 'test-rule-4',
      severity: 'error',
      category: 'metadata',
      url: 'https://example.org',
      message: 'Missing meta description',
      recommendation: 'Add a unique meta description'
    },
    {
      id: 'test5',
      ruleId: 'test-rule-5',
      severity: 'critical',
      category: 'ai_visibility',
      url: 'https://example.org',
      message: 'No structured data',
      recommendation: 'Add schema.org markup to key pages'
    }
  ],
  pagesAudited: 5,
  totalLoadTimeMs: 4200,
  pages: {},
  crawlGraph: {
    nodes: [],
    edges: [],
    metrics: {
      maxDepth: 2,
      orphanCount: 2,
      hubPages: [],
      authorityNodes: []
    }
  }
};

// Write test files
fs.writeFileSync(path.resolve('test-audit-1.json'), JSON.stringify(mockAudit1, null, 2));
fs.writeFileSync(path.resolve('test-audit-2.json'), JSON.stringify(mockAudit2, null, 2));

console.log('Test audit files generated: test-audit-1.json and test-audit-2.json');
