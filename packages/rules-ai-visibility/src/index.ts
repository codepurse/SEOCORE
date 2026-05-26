import * as cheerio from 'cheerio';
import type { NormalizedPage, Rule, RuleDefinition, RuleEvaluationContext } from '@seocore/sdk';
import { BaseRule, type PartialFinding, type RuleSettings } from '@seocore/rule-utils';
import { AI_VISIBILITY_SUB_CHECKS } from './sub-checks.js';

function flattenSchema(schema: unknown): unknown[] {
  if (!schema) {
    return [];
  }

  if (Array.isArray(schema)) {
    return schema.flatMap((item) => flattenSchema(item));
  }

  const result: unknown[] = [schema];
  if (typeof schema === 'object' && schema !== null) {
    const graph = (schema as { '@graph'?: unknown })['@graph'];
    if (Array.isArray(graph)) {
      result.push(...flattenSchema(graph));
    }
  }

  return result;
}

abstract class AiVisibilityRule extends BaseRule {
  protected load(page: NormalizedPage) {
    return page.html ? cheerio.load(page.html) : null;
  }
}

export class AiExtractabilityRule extends AiVisibilityRule {
  definition: RuleDefinition = {
    id: 'ai-extractability',
    name: 'AI Extractability & Semantic Markup',
    description: 'Evaluates DOM semantic structure and content-to-navigation ratio for AI crawlers.',
    category: 'ai_visibility',
    module: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/ai-extractability',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const $ = this.load(page);
    if (!$) {
      return [];
    }

    const findings: PartialFinding[] = [];
    const semanticContainers = $('article, main, section');
    if (semanticContainers.length === 0) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.extractability.noSemanticContainers,
        message: 'Lack of semantic content container elements reduces AI crawler extractability.',
        recommendation: 'Wrap primary page content in semantic HTML elements such as <main>, <article>, or <section> tags to help AI parsers locate main content.',
        evidence: 'No <main>, <article>, or <section> tags found.',
      });
    }

    const bodyText = $('body').text() || '';
    const bodyTextLength = bodyText.trim().length;
    if (bodyTextLength > 0) {
      let noiseTextLength = 0;
      $('nav, header, footer, [class*="nav"], [class*="menu"], [class*="footer"], [class*="header"]').each((_, el) => {
        noiseTextLength += ($(el).text() || '').trim().length;
      });

      const noiseRatio = noiseTextLength / bodyTextLength;
      if (noiseRatio > 0.5) {
        findings.push({
          url: page.url,
          subCheck: AI_VISIBILITY_SUB_CHECKS.extractability.highBoilerplateRatio,
          message: `High boilerplate-to-content ratio detected (noise ratio: ${(noiseRatio * 100).toFixed(0)}%).`,
          recommendation: 'Reduce navigational noise, sidebar widgets, and footer links, or isolate body content using an <article> or <main> tag to lower extractability overhead.',
          evidence: `Boilerplate text represents ${(noiseRatio * 100).toFixed(0)}% of total page weight.`,
        });
      }
    }

    let hasAnswerFirst = false;
    $('p').slice(0, 3).each((_, el) => {
      const leadingStrong = $(el).find('strong, b').first();
      if (leadingStrong.length > 0 && $(el).text().startsWith(leadingStrong.text())) {
        hasAnswerFirst = true;
      }
    });

    if (!hasAnswerFirst && bodyTextLength > 500) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.extractability.noAnswerFirst,
        severity: 'info',
        message: 'Page lacks concise answer-first summaries or bolded key-takeaway structures.',
        recommendation: 'Incorporate summary paragraphs with bolded lead-in sentences at the top of sections to support LLM paragraph retrieval and synthesis.',
        evidence: 'No bolded summary sentence detected in lead paragraphs.',
      });
    }

    return findings;
  }
}

export class AiEntityClarityRule extends AiVisibilityRule {
  definition: RuleDefinition = {
    id: 'ai-entity-clarity',
    name: 'AI Entity Clarity',
    description: 'Checks for well-defined Schema.org metadata to establish entity identity and topic consistency.',
    category: 'ai_visibility',
    module: 'ai_visibility',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/ai-entity-clarity',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const findings: PartialFinding[] = [];
    const allSchema = flattenSchema(page.structuredData);

    const hasEntity = allSchema.some((item) => {
      const type = (item as { '@type'?: unknown } | null)?.['@type'];
      if (typeof type !== 'string') {
        return false;
      }

      const normalizedType = type.toLowerCase();
      return normalizedType === 'organization'
        || normalizedType === 'person'
        || normalizedType === 'corporation'
        || normalizedType === 'localbusiness';
    });

    if (!hasEntity) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.entityClarity.weakEntity,
        message: 'Organization or Person entity is weakly defined in Schema.org metadata.',
        recommendation: 'Implement structured metadata (JSON-LD) explicitly defining an Organization, Person, or LocalBusiness entity to help AI search engines build reliable knowledge graphs.',
        evidence: 'No primary entity of type Organization, Person, Corporation, or LocalBusiness found.',
      });
      return findings;
    }

    const hasDisambiguation = allSchema.some((item) => {
      const schemaItem = item as { '@type'?: unknown; sameAs?: unknown } | null;
      const type = schemaItem?.['@type'];
      if (typeof type !== 'string') {
        return false;
      }

      const normalizedType = type.toLowerCase();
      const matchesType = normalizedType === 'organization'
        || normalizedType === 'person'
        || normalizedType === 'corporation'
        || normalizedType === 'localbusiness';

      if (!matchesType) {
        return false;
      }

      const sameAs = schemaItem?.sameAs;
      return Array.isArray(sameAs)
        ? sameAs.length > 0
        : typeof sameAs === 'string' && sameAs.trim().length > 0;
    });

    if (!hasDisambiguation) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.entityClarity.missingDisambiguation,
        severity: 'warning',
        message: "Missing 'sameAs' references for entity disambiguation in structured data.",
        recommendation: "Add 'sameAs' fields containing authoritative URLs (Wikipedia, Wikidata, LinkedIn, official social channels) to disambiguate the identity of defined entities.",
        evidence: 'Entity defined but is missing disambiguation sameAs links.',
      });
    }

    return findings;
  }
}

export class AiCitationReadinessRule extends AiVisibilityRule {
  definition: RuleDefinition = {
    id: 'ai-citation-readiness',
    name: 'AI Citation Readiness',
    description: 'Analyzes the presence of factual assertions, statistics, citations, and FAQ schemas for LLM referenceability.',
    category: 'ai_visibility',
    module: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/ai-citation-readiness',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const $ = this.load(page);
    if (!$) {
      return [];
    }

    const findings: PartialFinding[] = [];
    const bodyText = $('body').text() || '';
    const externalLinks = page.links ? page.links.filter((link) => !link.isInternal) : [];
    if (externalLinks.length === 0) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.citationReadiness.noExternalCitations,
        message: 'Page lacks outbound external citations or authoritative reference links.',
        recommendation: 'Provide outbound links to high-authority references, peer reviews, original source databases, or partner pages to build LLM confidence.',
        evidence: 'Outbound external link count: 0',
      });
    }

    const allSchema = flattenSchema(page.structuredData);
    const hasFaqSchema = allSchema.some((item) => {
      const type = (item as { '@type'?: unknown } | null)?.['@type'];
      return typeof type === 'string' && type.toLowerCase() === 'faqpage';
    });

    const pageHasQuestions =
      page.headings.h2?.some((heading) => heading.endsWith('?'))
      || page.headings.h3?.some((heading) => heading.endsWith('?'));

    if (pageHasQuestions && !hasFaqSchema) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.citationReadiness.missingFaqSchema,
        message: 'FAQ sections are missing structured schema markup.',
        recommendation: 'Add Schema.org FAQPage structured data to FAQ or Q&A content blocks to enable instant citation and answer extraction.',
        evidence: 'Questions detected in headers, but no FAQPage schema found.',
      });
    }

    const statRegex = /\b\d+(\.\d+)?%\b|\b(percent|percentage|statistics|statistics show|fact-checked|according to study|according to)\b/i;
    const hasStats = statRegex.test(bodyText);
    if (!hasStats && bodyText.trim().length > 500) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.citationReadiness.noStatistics,
        severity: 'info',
        message: 'No statistics or factual citations detected in content.',
        recommendation: 'Support claims with quantifiable data, metrics, percentage facts, or external citations to qualify as a source for factual AI queries.',
        evidence: 'No numeric percentages or sourcing phrases found in text.',
      });
    }

    return findings;
  }
}

export class AiStructuralOrganizationRule extends AiVisibilityRule {
  definition: RuleDefinition = {
    id: 'ai-structural-organization',
    name: 'AI Structural Organization',
    description: 'Verifies logical heading hierarchy and chunk-friendly formats like lists and tables for parsing clarity.',
    category: 'ai_visibility',
    module: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/ai-structural-organization',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const $ = this.load(page);
    if (!$) {
      return [];
    }

    const findings: PartialFinding[] = [];
    let hasBrokenHierarchy = false;
    const headingSequence: string[] = [];

    $(':header').each((_, el) => {
      headingSequence.push(el.name.toUpperCase());
    });

    for (let i = 0; i < headingSequence.length - 1; i++) {
      const current = Number.parseInt(headingSequence[i].substring(1), 10);
      const next = Number.parseInt(headingSequence[i + 1].substring(1), 10);
      if (next - current > 1) {
        hasBrokenHierarchy = true;
        break;
      }
    }

    if (hasBrokenHierarchy) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.structuralOrganization.brokenHierarchy,
        message: 'Heading hierarchy reduces retrieval clarity due to non-sequential nesting (e.g., H1 followed directly by H3).',
        recommendation: 'Nest headings sequentially (H1 followed by H2, then H3) to allow AI crawlers to construct logical thematic hierarchies.',
        evidence: `Heading sequence: ${headingSequence.slice(0, 6).join(' -> ')}`,
      });
    }

    const listsAndTablesCount = $('ul, ol, table').length;
    const wordCount = ($('body').text() || '').trim().split(/\s+/).length;
    if (listsAndTablesCount === 0 && wordCount > 200) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.structuralOrganization.noListsOrTables,
        severity: 'info',
        message: 'Page lacks list or table formatting, reducing chunk readability for AI scrapers.',
        recommendation: 'Use bulleted lists, numbered steps, or structured data tables to group complex points into easily digestible information blocks.',
        evidence: 'Zero lists (ul/ol) or tables found on page.',
      });
    }

    return findings;
  }
}

export class AiRetrievalFriendlinessRule extends AiVisibilityRule {
  definition: RuleDefinition = {
    id: 'ai-retrieval-friendliness',
    name: 'AI Retrieval Friendliness & Semantic Chunking',
    description: 'Evaluates paragraph length and continuity for optimal semantic chunking and embedding generation.',
    category: 'ai_visibility',
    module: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/ai-retrieval-friendliness',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const $ = this.load(page);
    if (!$) {
      return [];
    }

    const findings: PartialFinding[] = [];
    let tooLongParagraphsCount = 0;
    let longestParagraphLen = 0;

    $('p').each((_, el) => {
      const length = ($(el).text() || '').trim().length;
      if (length > longestParagraphLen) {
        longestParagraphLen = length;
      }
      if (length > 1200) {
        tooLongParagraphsCount++;
      }
    });

    if (tooLongParagraphsCount > 0) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.retrievalFriendliness.paragraphsTooLong,
        message: 'Content sections are too long for optimal semantic chunking.',
        recommendation: 'Refactor long paragraphs into smaller text blocks (under 150-200 words) to ensure clean semantic vectors and cohesive embeddings.',
        evidence: `${tooLongParagraphsCount} paragraph(s) exceed 1200 characters. Longest: ${longestParagraphLen} characters.`,
      });
    }

    const bodyText = $('body').text() || '';
    const wordCount = bodyText.trim().split(/\s+/).filter((word) => word.length > 0).length;
    if (wordCount > 0 && wordCount < 300) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.retrievalFriendliness.thinContent,
        severity: 'warning',
        message: 'Content is too thin for high-quality semantic retrieval (under 300 words).',
        recommendation: 'Expand content with contextual depth, examples, definitions, or Q&A structures to improve thematic coverage and semantic query mapping.',
        evidence: `Word count: ${wordCount} words.`,
      });
    }

    return findings;
  }
}

export class AiAuthoritySignalsRule extends AiVisibilityRule {
  definition: RuleDefinition = {
    id: 'ai-authority-signals',
    name: 'AI Authority Signals',
    description: 'Detects authority signals such as clear authorship, publication policies, and contact information.',
    category: 'ai_visibility',
    module: 'ai_visibility',
    defaultSeverity: 'warning',
    defaultWeight: 7,
    documentationLink: 'https://seocore.dev/docs/rules/ai-authority-signals',
  };

  protected async check(
    page: NormalizedPage,
    _context: RuleEvaluationContext,
    _settings: RuleSettings,
  ): Promise<PartialFinding[]> {
    const $ = this.load(page);
    if (!$) {
      return [];
    }

    const findings: PartialFinding[] = [];
    const bodyText = $('body').text() || '';
    const authorRegex = /\b(written by|by |author:|reviewed by|edited by|editor)\b/i;
    const hasAuthorEl = $('[rel="author"], [class*="author"], [id*="author"]').length > 0;
    const hasAuthorText = authorRegex.test(bodyText);

    if (!hasAuthorEl && !hasAuthorText) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.authoritySignals.missingAuthorship,
        message: 'Page lacks visible author profiles or clearly indicated authorship.',
        recommendation: 'Clearly display the author or reviewer of the content, linking to their profile, bio, or credentials to satisfy Search Generative Experience quality standards.',
        evidence: 'No rel="author", author class names, or explicit authorship phrases found.',
      });
    }

    const trustRegex = /\b(about us|contact us|privacy policy|terms of service|editorial policy|editorial team|who we are)\b/i;
    const linksText = page.links ? page.links.map((link) => link.text).join(' ') : '';
    const hasTrustSignals = trustRegex.test(bodyText) || trustRegex.test(linksText);

    if (!hasTrustSignals) {
      findings.push({
        url: page.url,
        subCheck: AI_VISIBILITY_SUB_CHECKS.authoritySignals.missingTrustSignals,
        message: 'Missing organizational trust signals (e.g., about, contact, or policy page links).',
        recommendation: 'Incorporate links to dedicated Transparency pages (About Us, Contact Us, Privacy Policy) in the navigation or footer to support site authority.',
        evidence: 'No links or clear text mentions of brand transparency pages found.',
      });
    }

    return findings;
  }
}

export function getAiVisibilityRules(): Rule[] {
  return [
    new AiExtractabilityRule(),
    new AiEntityClarityRule(),
    new AiCitationReadinessRule(),
    new AiStructuralOrganizationRule(),
    new AiRetrievalFriendlinessRule(),
    new AiAuthoritySignalsRule(),
  ];
}

export * from './sub-checks.js';
