
import { SchemaGraphStitcher, HierarchyNode } from './schema-graph.js';

// Schema.org Validator
export interface SchemaIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  schemaType: string;
  property?: string;
}

export interface ValidatedSchema {
  type: string;
  data: any;
  valid: boolean;
  issues: SchemaIssue[];
}

export interface SchemaValidationResult {
  targetUrl: string;
  validatedAt: string;
  schemas: ValidatedSchema[];
  totalSchemas: number;
  validSchemas: number;
  invalidSchemas: number;
  totalErrors: number;
  totalWarnings: number;
  graph?: {
    roots: any[];
    hierarchy: HierarchyNode[];
  };
}

// Define common Schema.org types and their required properties
const schemaRequirements: Record<string, { required: string[]; recommended?: string[] }> = {
  'Article': {
    required: ['headline', 'author'],
    recommended: ['datePublished', 'image', 'description']
  },
  'BlogPosting': {
    required: ['headline', 'author'],
    recommended: ['datePublished', 'image', 'description']
  },
  'Product': {
    required: ['name'],
    recommended: ['image', 'description', 'offers', 'brand']
  },
  'Organization': {
    required: ['name'],
    recommended: ['url', 'logo', 'sameAs']
  },
  'Person': {
    required: ['name'],
    recommended: ['url', 'sameAs', 'image']
  },
  'LocalBusiness': {
    required: ['name', 'address'],
    recommended: ['telephone', 'url', 'openingHours']
  },
  'FAQPage': {
    required: ['mainEntity'],
    recommended: []
  },
  'BreadcrumbList': {
    required: ['itemListElement'],
    recommended: []
  },
  'Recipe': {
    required: ['name'],
    recommended: ['author', 'datePublished', 'image', 'description', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'recipeIngredient', 'recipeInstructions']
  },
  'Event': {
    required: ['name', 'startDate', 'location'],
    recommended: ['description', 'image', 'endDate', 'organizer']
  },
  'JobPosting': {
    required: ['title', 'hiringOrganization', 'jobLocation', 'datePosted', 'validThrough'],
    recommended: ['description', 'employmentType', 'baseSalary']
  }
};

export class SchemaValidator {
  constructor() {}

  /**
   * Validate structured data (JSON-LD)
   */
  validate(structuredData: any[], targetUrl: string, page?: any): SchemaValidationResult {
    const validatedSchemas: ValidatedSchema[] = [];

    // Process all schema items
    for (const data of structuredData) {
      if (data.__error) {
        validatedSchemas.push({
          type: 'Invalid JSON-LD',
          data,
          valid: false,
          issues: [{
            level: 'error',
            message: 'Invalid JSON-LD syntax',
            schemaType: 'Invalid JSON-LD'
          }]
        });
        continue;
      }

      // Handle @graph arrays
      const items = data['@graph'] || [data];
      for (const item of items) {
        const validated = this.validateSchemaItem(item, page);
        validatedSchemas.push(validated);
      }
    }

    // Calculate summary
    const totalSchemas = validatedSchemas.length;
    const validSchemas = validatedSchemas.filter(s => s.valid).length;
    const invalidSchemas = totalSchemas - validSchemas;
    const totalErrors = validatedSchemas.reduce((sum, s) => sum + s.issues.filter(i => i.level === 'error').length, 0);
    const totalWarnings = validatedSchemas.reduce((sum, s) => sum + s.issues.filter(i => i.level === 'warning').length, 0);

    // Stitch all valid items into a unified entity graph
    const validItems = validatedSchemas
      .filter(s => s.type !== 'Invalid JSON-LD')
      .map(s => JSON.parse(JSON.stringify(s.data)));

    let graph: { roots: any[]; hierarchy: HierarchyNode[] } | undefined;
    if (validItems.length > 0) {
      try {
        const stitcher = new SchemaGraphStitcher();
        const stitched = stitcher.stitch(validItems);
        graph = {
          roots: stitched.roots,
          hierarchy: stitched.hierarchy
        };
      } catch (err) {
        console.error('[SchemaValidator] Stitcher error:', err);
      }
    }

    return {
      targetUrl,
      validatedAt: new Date().toISOString(),
      schemas: validatedSchemas,
      totalSchemas,
      validSchemas,
      invalidSchemas,
      totalErrors,
      totalWarnings,
      graph
    };
  }

  /**
   * Validate a single schema item
   */
  private validateSchemaItem(item: any, page?: any): ValidatedSchema {
    const type = this.getSchemaType(item);
    const issues: SchemaIssue[] = [];

    // Check @type
    if (!type) {
      issues.push({
        level: 'error',
        message: 'Schema is missing @type property',
        schemaType: 'Unknown'
      });
      return {
        type: 'Unknown',
        data: item,
        valid: false,
        issues
      };
    }

    // Get requirements for this schema type
    const requirements = schemaRequirements[type];

    if (requirements) {
      // Check required properties
      for (const reqProp of requirements.required) {
        if (!this.hasProperty(item, reqProp)) {
          issues.push({
            level: 'error',
            message: `Missing required property: ${reqProp}`,
            schemaType: type,
            property: reqProp
          });
        }
      }

      // Check recommended properties
      if (requirements.recommended) {
        for (const recProp of requirements.recommended) {
          if (!this.hasProperty(item, recProp)) {
            issues.push({
              level: 'warning',
              message: `Missing recommended property: ${recProp}`,
              schemaType: type,
              property: recProp
            });
          }
        }
      }
    } else {
      issues.push({
        level: 'info',
        message: `Schema type ${type} is not in our validation database. Basic checks only.`,
        schemaType: type
      });
    }

    // Check for common issues
    this.checkCommonIssues(item, type, issues, page);

    // E-E-A-T trust audit
    this.auditEEAT(item, type, issues);

    // Integrity cross checks
    this.crossCheckIntegrity(item, type, issues, page);

    const valid = !issues.some(i => i.level === 'error');

    return {
      type,
      data: item,
      valid,
      issues
    };
  }

  /**
   * Get the schema type from an item
   */
  private getSchemaType(item: any): string | null {
    if (!item) return null;
    const type = item['@type'];
    if (Array.isArray(type)) {
      return type[0];
    }
    return type;
  }

  /**
   * Check if an item has a property (handles nested)
   */
  private hasProperty(item: any, prop: string): boolean {
    return item[prop] !== undefined && item[prop] !== null && item[prop] !== '';
  }

  /**
   * Check for common schema issues
   */
  private checkCommonIssues(item: any, type: string, issues: SchemaIssue[], page?: any): void {
    // Check for empty strings
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'string' && value.trim() === '') {
        issues.push({
          level: 'warning',
          message: `Property ${key} has empty string value`,
          schemaType: type,
          property: key
        });
      }
    }

    // Special checks for specific types
    if (type === 'BreadcrumbList') {
      this.checkBreadcrumbList(item, issues);
    }

    if (type === 'FAQPage') {
      this.checkFAQPage(item, issues);
    }
  }

  /**
   * E-E-A-T Trust Auditor: Evaluate outbound authority links
   */
  private auditEEAT(item: any, type: string, issues: SchemaIssue[]): void {
    const isEEATType = ['Person', 'Organization', 'LocalBusiness'].includes(type);
    
    // Check main sameAs
    if (isEEATType) {
      if (!this.hasProperty(item, 'sameAs')) {
        issues.push({
          level: 'info',
          message: `E-E-A-T Trust Alert: Type ${type} is missing 'sameAs' property. Strongly recommend linking to Wikipedia, Wikidata, or LinkedIn to establish authority.`,
          schemaType: type,
          property: 'sameAs'
        });
      } else {
        const sameAsVal = item.sameAs;
        const urls = Array.isArray(sameAsVal) ? sameAsVal : [sameAsVal];
        const authorityDomains = ['wikipedia.org', 'wikidata.org', 'linkedin.com', 'twitter.com', 'x.com', 'crunchbase.com', 'github.com'];
        
        let hasAuthorityLink = false;
        for (const url of urls) {
          if (typeof url === 'string') {
            const match = authorityDomains.some(d => url.includes(d));
            if (match) {
              hasAuthorityLink = true;
              issues.push({
                level: 'info',
                message: `E-E-A-T Validation: Outbound authority link verified: ${url}`,
                schemaType: type,
                property: 'sameAs'
              });
            }
          }
        }
        
        if (!hasAuthorityLink) {
          issues.push({
            level: 'info',
            message: `E-E-A-T recommendation: Consider adding high-authority 'sameAs' links (e.g., Wikipedia/Wikidata) for better authority validation.`,
            schemaType: type,
            property: 'sameAs'
          });
        }
      }
    }

    // Also check nested author or publisher objects if they exist
    if (item.author && typeof item.author === 'object') {
      const authorType = item.author['@type'] || 'Person';
      if (!this.hasProperty(item.author, 'sameAs')) {
        issues.push({
          level: 'info',
          message: `E-E-A-T Trust Alert: Author is missing 'sameAs' links to establish individual expertise.`,
          schemaType: type,
          property: 'author'
        });
      }
    }
  }

  /**
   * Integrity Cross-Checker: Compare JSON-LD values against other metadata
   */
  private crossCheckIntegrity(item: any, type: string, issues: SchemaIssue[], page?: any): void {
    if (!page) return;

    // 1. Compare Title/Headline
    const schemaTitle = item.headline || item.name;
    const pageTitle = page.title || (page.openGraph && page.openGraph.title) || (page.twitterCard && page.twitterCard.title);
    
    if (schemaTitle && pageTitle) {
      const cleanSchemaTitle = schemaTitle.trim().toLowerCase();
      const cleanPageTitle = pageTitle.trim().toLowerCase();
      
      if (!cleanPageTitle.includes(cleanSchemaTitle) && !cleanSchemaTitle.includes(cleanPageTitle)) {
        issues.push({
          level: 'warning',
          message: `Integrity Alert: Schema title/headline ("${schemaTitle}") does not match HTML page title ("${pageTitle}"). Maintain metadata consistency.`,
          schemaType: type,
          property: item.headline ? 'headline' : 'name'
        });
      }
    }

    // 2. Compare Canonical/URL
    const schemaUrl = item.url || item.mainEntityOfPage;
    const pageUrl = page.canonical || page.url;
    
    if (schemaUrl && pageUrl) {
      const cleanSchemaUrl = typeof schemaUrl === 'string' ? schemaUrl : schemaUrl['@id'] || '';
      if (cleanSchemaUrl) {
        try {
          const sUrlObj = new URL(cleanSchemaUrl);
          const pUrlObj = new URL(pageUrl);
          if (sUrlObj.pathname !== pUrlObj.pathname) {
            issues.push({
              level: 'warning',
              message: `Integrity Alert: Schema URL/mainEntityOfPage ("${cleanSchemaUrl}") points to a different path than page canonical URL ("${pageUrl}").`,
              schemaType: type,
              property: item.url ? 'url' : 'mainEntityOfPage'
            });
          }
        } catch {
          // ignore invalid URLs
        }
      }
    }

    // 3. Compare Product Price
    if (type === 'Product' && item.offers) {
      const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      const schemaPrice = offers.price;
      const schemaCurrency = offers.priceCurrency;

      const ogPrice = page.openGraph?.['price:amount'] || page.openGraph?.['price'];
      const ogCurrency = page.openGraph?.['price:currency'];

      if (schemaPrice && ogPrice && String(schemaPrice) !== String(ogPrice)) {
        issues.push({
          level: 'warning',
          message: `Integrity Alert: Schema product price ($${schemaPrice}) does not match OpenGraph tag price ($${ogPrice}).`,
          schemaType: type,
          property: 'offers.price'
        });
      }

      if (schemaCurrency && ogCurrency && schemaCurrency.toUpperCase() !== ogCurrency.toUpperCase()) {
        issues.push({
          level: 'warning',
          message: `Integrity Alert: Schema price currency (${schemaCurrency}) does not match OpenGraph tag currency (${ogCurrency}).`,
          schemaType: type,
          property: 'offers.priceCurrency'
        });
      }
    }
  }

  /**
   * Special checks for BreadcrumbList
   */
  private checkBreadcrumbList(item: any, issues: SchemaIssue[]): void {
    const elements = item.itemListElement;
    if (elements && Array.isArray(elements)) {
      if (elements.length === 0) {
        issues.push({
          level: 'error',
          message: 'BreadcrumbList.itemListElement is empty',
          schemaType: 'BreadcrumbList',
          property: 'itemListElement'
        });
      } else {
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (!el.position) {
            issues.push({
              level: 'warning',
              message: `Breadcrumb item ${i} missing position property`,
              schemaType: 'BreadcrumbList',
              property: 'itemListElement'
            });
          }
          if (!el.item) {
            issues.push({
              level: 'error',
              message: `Breadcrumb item ${i} missing item property`,
              schemaType: 'BreadcrumbList',
              property: 'itemListElement'
            });
          }
        }
      }
    }
  }

  /**
   * Special checks for FAQPage
   */
  private checkFAQPage(item: any, issues: SchemaIssue[]): void {
    const mainEntity = item.mainEntity;
    if (mainEntity && Array.isArray(mainEntity)) {
      for (let i = 0; i < mainEntity.length; i++) {
        const qa = mainEntity[i];
        if (qa['@type'] !== 'Question') {
          issues.push({
            level: 'warning',
            message: `FAQ mainEntity item ${i} is not a Question type`,
            schemaType: 'FAQPage',
            property: 'mainEntity'
          });
        }
        if (!qa.name) {
          issues.push({
            level: 'error',
            message: `Question ${i} missing name (question text)`,
            schemaType: 'FAQPage',
            property: 'mainEntity'
          });
        }
        if (!qa.acceptedAnswer) {
          issues.push({
            level: 'error',
            message: `Question ${i} missing acceptedAnswer`,
            schemaType: 'FAQPage',
            property: 'mainEntity'
          });
        }
      }
    }
  }
}
