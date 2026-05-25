import * as cheerio from 'cheerio';
import { NormalizedPage } from '@seocore/sdk';

export interface ContentAnalysis {
  readability: {
    fleschReadingEase: number;
    fleschKincaidGradeLevel: number;
  };
  keywords: Array<{ term: string; density: number; count: number }>;
  headings: { h1Count: number; h2Count: number; h3Count: number; hierarchy: boolean };
  wordCount: number;
  contentLengthScore: number;
  internalLinkDensity: number;
}

export class ContentAnalyzer {
  analyze(html: string, normalizedPage: NormalizedPage): ContentAnalysis {
    const text = this.extractCleanText(html);
    const words = this.tokenizeWords(text);
    const wordCount = words.length;
    const sentences = this.splitSentences(text);
    const syllableCount = words.reduce((sum, word) => sum + this.countSyllables(word), 0);

    const readability = this.calculateReadability(wordCount, sentences.length, syllableCount);
    const keywords = this.extractTopKeywords(words);
    const headings = this.analyzeHeadings(html, normalizedPage);
    const internalLinkDensity = this.calculateInternalLinkDensity(normalizedPage, wordCount);
    const contentLengthScore = this.calculateContentLengthScore(wordCount);

    return {
      readability,
      keywords,
      headings,
      wordCount,
      contentLengthScore,
      internalLinkDensity,
    };
  }

  private extractCleanText(html: string): string {
    const $ = cheerio.load(html);
    // Remove script, style, and other non-content elements
    $('script, style, noscript, iframe, header, footer, nav, aside').remove();
    return $.text().replace(/\s+/g, ' ').trim();
  }

  private tokenizeWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2); // Filter out very short words
  }

  private splitSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private countSyllables(word: string): number {
    // Simple syllable counting heuristic
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  private calculateReadability(
    wordCount: number,
    sentenceCount: number,
    syllableCount: number
  ): { fleschReadingEase: number; fleschKincaidGradeLevel: number } {
    const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;
    const avgSyllablesPerWord = wordCount > 0 ? syllableCount / wordCount : 0;

    // Flesch Reading Ease: higher = easier
    const fleschReadingEase = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

    // Flesch-Kincaid Grade Level: lower = easier
    const fleschKincaidGradeLevel = (0.39 * avgSentenceLength) + (11.8 * avgSyllablesPerWord) - 15.59;

    return {
      fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
      fleschKincaidGradeLevel: Math.round(fleschKincaidGradeLevel * 10) / 10,
    };
  }

  private extractTopKeywords(words: string[]): Array<{ term: string; density: number; count: number }> {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'our', 'with', 'that',
      'your', 'this', 'from', 'have', 'they', 'will', 'can', 'more', 'when',
      'what', 'there', 'their', 'which', 'were', 'been', 'would', 'about',
      'could', 'other', 'some', 'than', 'then', 'into', 'only', 'its', 'like',
      'very', 'make', 'over', 'also', 'these', 'such', 'time', 'look', 'still',
      'many', 'take', 'come', 'each', 'well', 'back', 'even', 'after', 'work',
      'first', 'any', 'new', 'because', 'think', 'most', 'find', 'day', 'way',
      'use', 'how', 'get', 'see', 'two', 'way', 'who', 'out', 'all', 'there',
      'so', 'up', 'if', 'no', 'do', 'it', 'he', 'she', 'we', 'me', 'us', 'is',
      'am', 'was', 'on', 'in', 'to', 'of', 'at', 'by', 'a', 'an', 'i'
    ]);

    const wordFreq = new Map<string, number>();
    for (const word of words) {
      if (!stopWords.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    }

    const totalWords = words.length;
    const sortedKeywords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({
        term,
        count,
        density: totalWords > 0 ? count / totalWords : 0,
      }));

    return sortedKeywords;
  }

  private analyzeHeadings(html: string, normalizedPage: NormalizedPage): { h1Count: number; h2Count: number; h3Count: number; hierarchy: boolean } {
    const $ = cheerio.load(html);
    const h1Count = $('h1').length;
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;

    // Check if there's at least one H1, and H2s are present if there are H3s
    const hierarchy = h1Count === 1 && (h3Count === 0 || h2Count > 0);

    return { h1Count, h2Count, h3Count, hierarchy };
  }

  private calculateInternalLinkDensity(normalizedPage: NormalizedPage, wordCount: number): number {
    const internalLinkCount = normalizedPage.links.filter(l => l.isInternal).length;
    return wordCount > 0 ? (internalLinkCount / wordCount) * 100 : 0; // links per 100 words
  }

  private calculateContentLengthScore(wordCount: number): number {
    if (wordCount >= 2000) return 100;
    if (wordCount >= 1500) return 90;
    if (wordCount >= 1000) return 80;
    if (wordCount >= 700) return 70;
    if (wordCount >= 500) return 60;
    if (wordCount >= 300) return 50;
    if (wordCount >= 200) return 40;
    if (wordCount >= 100) return 30;
    return Math.max(0, wordCount * 0.2);
  }
}
