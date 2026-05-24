import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBacklinkClient } from './index';

describe('CustomBacklinkClient', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('merges GSC export rows with access-log referrers', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'seocore-backlinks-'));
    tempDirs.push(tempDir);

    const gscPath = join(tempDir, 'gsc-links.csv');
    const logsPath = join(tempDir, 'access.log');

    writeFileSync(
      gscPath,
      [
        'Linking Page,Target URL,Anchor Text',
        'https://news.example.com/post,https://example.com/,brand search',
      ].join('\n'),
      'utf8'
    );

    writeFileSync(
      logsPath,
      '127.0.0.1 - - [10/Oct/2023:13:55:36 +0000] "GET / HTTP/1.1" 200 123 "https://blog.example.org/review" "Mozilla/5.0"',
      'utf8'
    );

    const client = createBacklinkClient({
      provider: 'custom',
      gsc: { exportPath: gscPath },
      logs: { paths: [logsPath] },
    });

    const intelligence = await client.getIntelligence('https://example.com/', 25);

    expect(intelligence.sources).toEqual(['gsc', 'logs']);
    expect(intelligence.backlinks).toHaveLength(2);
    expect(intelligence.domainMetrics.referringDomains).toBe(2);
    expect(intelligence.domainMetrics.notes).toContain('GSC export is sample-based and does not expose nofollow metadata.');
    expect(intelligence.domainMetrics.notes).toContain('Access-log source only captures backlinks that generated visits.');
  });
});
