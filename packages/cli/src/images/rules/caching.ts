import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const CachingRule: ImageRule = {
  id: 'image-caching',
  name: 'Cache Control and CDN Delivery',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    for (const img of images) {
      if (img.fetchFailed || img.statusCode !== 200) continue;

      const cacheControl = img.cacheControl || '';
      
      // 1. Missing or short Cache-Control
      let maxAge = 0;
      const maxAgeMatch = cacheControl.match(/max-age\s*=\s*(\d+)/i);
      if (maxAgeMatch) {
        maxAge = parseInt(maxAgeMatch[1], 10);
      }

      const isNoCache = /no-cache|no-store|private/i.test(cacheControl);

      if (!cacheControl || (maxAge < 86400 && !isNoCache)) {
        findings.push({
          ruleId: this.id,
          imageSrc: img.src,
          severity: 'warning',
          message: 'Image has suboptimal or missing browser caching headers.',
          recommendation: 'Configure your web server to serve images with a long Cache-Control: max-age=31536000 headers. Images are static assets and should be cached aggressively.',
          evidence: `Cache-Control: ${cacheControl || 'none'}. max-age: ${maxAge}s.`,
        });
      }

      // 2. CDN check
      if (img.isCdn === false) {
        findings.push({
          ruleId: 'image-cdn',
          imageSrc: img.src,
          severity: 'info',
          message: 'Image is served without CDN (Content Delivery Network) headers.',
          recommendation: 'Serve static images through a global CDN (e.g. Cloudflare, CloudFront, Fastly). CDNs reduce latency by caching images closer to your edge users.',
          evidence: `No standard CDN header footprints detected.`,
        });
      }

      // 3. Immutable check on hashed filenames
      const isHashed = /\.[a-f0-9]{8,32}\./i.test(img.src) || 
                       /-[a-f0-9]{8,32}\./i.test(img.src) ||
                       /\/[a-f0-9]{20,40}\//i.test(img.src);
      const isImmutable = cacheControl.includes('immutable');

      if (isHashed && !isImmutable && maxAge >= 86400) {
        findings.push({
          ruleId: 'image-immutable',
          imageSrc: img.src,
          severity: 'info',
          message: 'Hashed image filename detected but is missing the "immutable" cache directive.',
          recommendation: 'Add the "immutable" directive to your Cache-Control header (e.g., Cache-Control: public, max-age=31536000, immutable). This prevents browsers from revalidating the file with the server.',
          evidence: `File matches hashed naming pattern, but immutable directive was absent.`,
        });
      }
    }

    return findings;
  }
};
