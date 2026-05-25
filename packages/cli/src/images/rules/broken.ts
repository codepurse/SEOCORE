import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const BrokenRule: ImageRule = {
  id: 'image-broken',
  name: 'Broken or Defective Images',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    for (const img of images) {
      // 1. Broken / Errored HTTP status
      if (img.fetchFailed || (img.statusCode && (img.statusCode >= 400 || img.statusCode === 0))) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'critical',
          message: `Broken image link! The server responded with HTTP status ${img.statusCode || 'failed'} / error: ${img.fetchError || 'Network Error'}.`,
          recommendation: 'Fix the broken link or remove the image reference. Broken assets hurt user experience and create crawl errors for search bots.',
          evidence: `HTTP Status: ${img.statusCode || '0'}. Error: ${img.fetchError || 'Network Failure'}.`,
        });
        continue; // skip other checks on broken link
      }

      // 2. Mixed content (HTTPS page loading HTTP image)
      // Check if any of the page URLs is https but the image is loaded over http
      const isMixedContent = img.src.startsWith('http://') && img.pages.some(p => p.startsWith('https://'));
      if (isMixedContent) {
        findings.push({
          ruleId: 'image-mixed-content',
          imageSrc: img.src,
          severity: 'error',
          message: 'Mixed content security risk. Loaded over insecure HTTP protocol on an HTTPS secure page.',
          recommendation: 'Upgrade the image URL to load over HTTPS (e.g. https:// instead of http://) to ensure security and prevent browser mixed-content warnings.',
          evidence: `Image scheme: http. Loaded on secure HTTPS host.`,
        });
      }

      // 3. Decode failed
      if (img.decodeFailed) {
        findings.push({
          ruleId: 'image-decode-failed',
          imageSrc: img.src,
          severity: 'warning',
          message: `Image failed to decode: ${img.decodeError || 'Invalid image header or file corruption'}.`,
          recommendation: 'Verify that this image is not corrupted and is saved with the correct extension matching its internal content format.',
          evidence: `Decode error: ${img.decodeError || 'Unknown sharp parse failure'}.`,
        });
      }
    }

    return findings;
  }
};
