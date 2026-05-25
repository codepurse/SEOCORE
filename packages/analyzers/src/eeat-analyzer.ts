import * as cheerio from 'cheerio';
import { NormalizedPage } from '@seocore/sdk';

export interface EeatAnalysis {
  overallScore: number;
  pillars: {
    experience: number;
    expertise: number;
    authoritativeness: number;
    trustworthiness: number;
  };
  findings: Array<{ type: 'error' | 'warning' | 'success'; message: string; pillar: keyof EeatAnalysis['pillars'] }>;
}

export class EeatAnalyzer {
  async analyze(
    url: string,
    normalizedPage: NormalizedPage,
    crawlData?: any,
    backlinkData?: any,
  ): Promise<EeatAnalysis> {
    const findings: Array<{ type: 'error' | 'warning' | 'success'; message: string; pillar: keyof EeatAnalysis['pillars'] }> = [];

    // Experience analysis
    const experience = this.analyzeExperience(normalizedPage.html, findings);
    
    // Expertise analysis
    const expertise = this.analyzeExpertise(normalizedPage.html, normalizedPage.structuredData, findings);
    
    // Authoritativeness analysis
    const authoritativeness = this.analyzeAuthoritativeness(normalizedPage, backlinkData, findings);
    
    // Trustworthiness analysis
    const trustworthiness = this.analyzeTrustworthiness(normalizedPage, url, findings);

    const overallScore = Math.round((experience + expertise + authoritativeness + trustworthiness) / 4);

    return {
      overallScore,
      pillars: {
        experience,
        expertise,
        authoritativeness,
        trustworthiness,
      },
      findings,
    };
  }

  private analyzeExperience(html: string, findings: any[]): number {
    let score = 50;
    const $ = cheerio.load(html);
    const text = $.text().toLowerCase();

    // Check for first-person experience language
    const experienceKeywords = ['i tried', 'i tested', 'i used', 'my experience', 'in my opinion', 'i found', 'i review', 'my review', 'hands-on', 'first-hand'];
    const hasExperienceLanguage = experienceKeywords.some(kw => text.includes(kw));

    if (hasExperienceLanguage) {
      score += 30;
      findings.push({ type: 'success', message: 'First-hand experience language detected', pillar: 'experience' });
    } else {
      findings.push({ type: 'warning', message: 'Consider adding first-hand experience language (e.g., "I tried", "I tested")', pillar: 'experience' });
    }

    // Check for review schema
    const hasReviewSchema = $('script[type="application/ld+json"]').html()?.includes('Review') ||
                            $('script[type="application/ld+json"]').html()?.includes('Product');
    if (hasReviewSchema) {
      score += 20;
      findings.push({ type: 'success', message: 'Review or Product schema present', pillar: 'experience' });
    }

    return Math.min(100, score);
  }

  private analyzeExpertise(html: string, structuredData: any[], findings: any[]): number {
    let score = 50;
    const $ = cheerio.load(html);

    // Check for author information
    const hasAuthor = $('meta[name="author"]').length > 0 || 
                      $('.author').length > 0 || 
                      $('[class*="author"]').length > 0 ||
                      $('[rel="author"]').length > 0;

    if (hasAuthor) {
      score += 25;
      findings.push({ type: 'success', message: 'Author information present', pillar: 'expertise' });
    } else {
      findings.push({ type: 'warning', message: 'Add author information or bio to establish expertise', pillar: 'expertise' });
    }

    // Check for credentials or about us links
    const hasAboutLink = $('a').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes('about') || text.includes('bio') || text.includes('credentials');
    }).length > 0;

    if (hasAboutLink) {
      score += 15;
      findings.push({ type: 'success', message: 'About or bio link present', pillar: 'expertise' });
    }

    // Check for professional schema (Person, Organization)
    const hasProfessionalSchema = structuredData.some(sd => 
      sd['@type'] === 'Person' || sd['@type'] === 'Organization' ||
      (Array.isArray(sd['@type']) && (sd['@type'].includes('Person') || sd['@type'].includes('Organization')))
    );

    if (hasProfessionalSchema) {
      score += 10;
      findings.push({ type: 'success', message: 'Professional schema (Person/Organization) present', pillar: 'expertise' });
    }

    return Math.min(100, score);
  }

  private analyzeAuthoritativeness(normalizedPage: NormalizedPage, backlinkData: any, findings: any[]): number {
    let score = 50;

    // Check for internal links
    if (normalizedPage.links.filter(l => l.isInternal).length > 3) {
      score += 20;
      findings.push({ type: 'success', message: 'Good internal linking structure', pillar: 'authoritativeness' });
    } else {
      findings.push({ type: 'warning', message: 'Consider adding more internal links to relevant content', pillar: 'authoritativeness' });
    }

    // Check for external authoritative links (simplified)
    const externalLinks = normalizedPage.links.filter(l => !l.isInternal);
    if (externalLinks.length > 0) {
      score += 20;
      findings.push({ type: 'success', message: 'External links to other sites present', pillar: 'authoritativeness' });
    }

    // If we had backlink data, we could use it here
    if (backlinkData) {
      score += 10;
    }

    return Math.min(100, score);
  }

  private analyzeTrustworthiness(normalizedPage: NormalizedPage, url: string, findings: any[]): number {
    let score = 50;

    // Check for HTTPS
    if (url.startsWith('https://')) {
      score += 20;
      findings.push({ type: 'success', message: 'Site uses HTTPS', pillar: 'trustworthiness' });
    } else {
      findings.push({ type: 'error', message: 'Site should use HTTPS for better trustworthiness', pillar: 'trustworthiness' });
    }

    // Check for privacy policy, contact, about us links
    const $ = cheerio.load(normalizedPage.html);
    const importantLinks = ['privacy', 'contact', 'about', 'terms', 'disclaimer'];
    let foundCount = 0;
    
    importantLinks.forEach(kw => {
      const found = $('a').filter((_, el) => $(el).text().toLowerCase().includes(kw)).length > 0;
      if (found) foundCount++;
    });

    if (foundCount >= 2) {
      score += 20;
      findings.push({ type: 'success', message: 'Important trust pages present (privacy, contact, about, etc.)', pillar: 'trustworthiness' });
    } else {
      findings.push({ type: 'warning', message: 'Add privacy policy, contact, and about us pages', pillar: 'trustworthiness' });
    }

    // Check for Wikipedia or Wikidata links (simplified)
    const hasWikiLink = normalizedPage.links.some(l => 
      l.url.includes('wikipedia.org') || l.url.includes('wikidata.org')
    );

    if (hasWikiLink) {
      score += 10;
      findings.push({ type: 'success', message: 'Link to Wikipedia or Wikidata present', pillar: 'trustworthiness' });
    }

    return Math.min(100, score);
  }
}
