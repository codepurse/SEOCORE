import { describe, expect, it } from 'vitest';
import { classifyEvidence, extractBusinessProfile, extractNap, scoreTokenOverlap } from './index.js';
import type { DirectoryEvidence, SourceBusinessProfile } from './types.js';

describe('directories live matching', () => {
  it('extracts business details plus sameAs directory links', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "Navix Health",
            "telephone": "855-490-1982",
            "url": "https://navixhealth.com",
            "sameAs": [
              "https://www.facebook.com/navixhealth",
              "https://www.yelp.com/biz/navix-health-costa-mesa"
            ],
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "2900 Bristol St B324",
              "addressLocality": "Costa Mesa",
              "addressRegion": "CA",
              "postalCode": "92626"
            }
          }
        </script>
      </body>
      </html>
    `;

    const nap = extractNap(html, 'https://navixhealth.com');
    const profile = extractBusinessProfile(html, 'https://navixhealth.com');

    expect(nap.name).toBe('Navix Health');
    expect(nap.phone).toBe('855-490-1982');
    expect(nap.address).toContain('2900 Bristol St B324');
    expect(nap.website).toBe('https://navixhealth.com');
    expect(profile.directoryLinks.Facebook?.[0]).toContain('facebook.com/navixhealth');
    expect(profile.directoryLinks.Yelp?.[0]).toContain('yelp.com/biz/navix-health-costa-mesa');
  });

  it('scores high overlap for same business name with extra tokens', () => {
    const score = scoreTokenOverlap('Navix Health', 'Navix Health Mental Wellness Center', new Set(['health', 'center']));
    expect(score).toBe(1);
  });

  it('flags wrong phone number when listing is validated by website and name', () => {
    const source: SourceBusinessProfile = {
      name: 'Navix Health',
      phone: '855-490-1982',
      address: '2900 Bristol St B324, Costa Mesa, CA 92626',
      website: 'https://navixhealth.com',
      directoryLinks: {},
    };

    const evidence: DirectoryEvidence = {
      listingUrl: 'https://www.yelp.com/biz/navix-health-costa-mesa',
      source: 'serpapi',
      sourceTitle: 'Navix Health - Costa Mesa, CA - Yelp',
      sourceSnippet: 'Navix Health at 2900 Bristol St B324 Costa Mesa CA 92626',
      matchedSignals: ['website link matches', 'business name matches', 'address matches'],
      mismatchedSignals: ['phone mismatch'],
      listingNap: {
        name: 'Navix Health',
        phone: '949-555-1212',
        address: '2900 Bristol St B324, Costa Mesa, CA 92626',
        website: 'https://navixhealth.com',
      },
      websiteMatch: true,
      phoneMatch: false,
      addressScore: 1,
      nameScore: 1,
      confidence: 0.9,
    };

    expect(classifyEvidence(source, evidence)).toBe('Wrong Phone Number');
  });
});
