import { NormalizedPage } from '@seocore/sdk';
import { techSignatures, type WeightedEvidence } from './technology-signatures.js';
import { TechnologyContextBuilder } from './technology-context.js';

export type TechnologyCategory =
  | 'frontendFramework'
  | 'renderingStrategy'
  | 'hosting'
  | 'cdn'
  | 'backend'
  | 'cms'
  | 'analytics'
  | 'uiLibraries'
  | 'buildTools'
  | 'fonts'
  | 'thirdPartyServices';

export interface DetectedTechnology {
  name: string;
  category: TechnologyCategory;
  confidence: number; // 0-100
  confidenceLevel: 'high' | 'medium';
  evidence: string[];
}

export interface TechnologySummary {
  frontendFramework: DetectedTechnology[];
  renderingStrategy: DetectedTechnology[];
  hosting: DetectedTechnology[];
  cdn: DetectedTechnology[];
  backend: DetectedTechnology[];
  cms: DetectedTechnology[];
  analytics: DetectedTechnology[];
  uiLibraries: DetectedTechnology[];
  buildTools: DetectedTechnology[];
  fonts: DetectedTechnology[];
  thirdPartyServices: DetectedTechnology[];
  undetectable: string[];
}

export class TechnologyDetector {
  static detect(page: NormalizedPage): TechnologySummary {
    const context = TechnologyContextBuilder.build(page);
    const detected: Map<string, DetectedTechnology> = new Map();
    const suppressed = new Set<string>();
    const minimumConfidence = 55;

    for (const sig of techSignatures) {
      const evidence = this.dedupeEvidence(sig.match(context));
      if (evidence.length === 0) continue;

      const confidence = this.scoreEvidence(evidence);
      if (confidence < (sig.minimumConfidence ?? minimumConfidence)) continue;

      detected.set(sig.technology, {
        name: sig.technology,
        category: sig.category,
        confidence,
        confidenceLevel: this.getConfidenceLevel(confidence),
        evidence: evidence.map(item => item.detail)
      });

      if (sig.suppresses) {
        for (const sup of sig.suppresses) {
          suppressed.add(sup);
        }
      }
    }

    const summary: TechnologySummary = {
      frontendFramework: [],
      renderingStrategy: [],
      hosting: [],
      cdn: [],
      backend: [],
      cms: [],
      analytics: [],
      uiLibraries: [],
      buildTools: [],
      fonts: [],
      thirdPartyServices: [],
      undetectable: []
    };

    for (const [name, tech] of detected) {
      if (suppressed.has(name)) continue;
      summary[tech.category].push(tech);
    }

    const renderingStrategy = this.inferRenderingStrategy(summary, context);
    if (renderingStrategy) {
      summary.renderingStrategy.push(renderingStrategy);
    }

    if (summary.backend.length === 0) {
      summary.undetectable.push('No backend signals directly detectable from public headers or HTML.');
    }

    this.sortSummary(summary);
    return summary;
  }

  private static dedupeEvidence(evidence: WeightedEvidence[]): WeightedEvidence[] {
    const deduped = new Map<string, WeightedEvidence>();
    for (const item of evidence) {
      const existing = deduped.get(item.detail);
      if (!existing || item.weight > existing.weight) {
        deduped.set(item.detail, item);
      }
    }
    return [...deduped.values()];
  }

  private static scoreEvidence(evidence: WeightedEvidence[]): number {
    return Math.min(95, evidence.reduce((total, item) => total + item.weight, 0));
  }

  private static getConfidenceLevel(confidence: number): 'high' | 'medium' {
    return confidence >= 80 ? 'high' : 'medium';
  }

  private static inferRenderingStrategy(summary: TechnologySummary, context: ReturnType<typeof TechnologyContextBuilder.build>): DetectedTechnology | undefined {
    const frameworks = new Set(summary.frontendFramework.map(tech => tech.name));
    const cms = new Set(summary.cms.map(tech => tech.name));
    return (
      this.getHybridRenderingStrategy(frameworks, context) ||
      this.getServerRenderedStrategy(summary, cms, context) ||
      this.getClientFrameworkStrategy(frameworks, context)
    );
  }

  private static getHybridRenderingStrategy(
    frameworks: Set<string>,
    context: ReturnType<typeof TechnologyContextBuilder.build>
  ): DetectedTechnology | undefined {
    const hybridFrameworks = ['Next.js', 'Nuxt', 'Astro'].filter(name => frameworks.has(name));
    if (hybridFrameworks.length === 0) {
      return undefined;
    }

    const evidence = hybridFrameworks.map(name => `Framework detection indicates ${name}`);
    if (context.bodyTextLength >= 200) {
      evidence.push('Initial HTML already contains meaningful body text');
    }

    return this.createRenderingStrategy(
      'Hybrid / SSR / SSG',
      context.bodyTextLength >= 200 ? 90 : 80,
      evidence
    );
  }

  private static getServerRenderedStrategy(
    summary: TechnologySummary,
    cms: Set<string>,
    context: ReturnType<typeof TechnologyContextBuilder.build>
  ): DetectedTechnology | undefined {
    const backendSignals = summary.backend
      .map(tech => tech.name)
      .filter(name => ['PHP', 'ASP.NET', 'nginx', 'Apache', 'OpenResty', 'Caddy'].includes(name));

    if (backendSignals.length === 0 && cms.size === 0) {
      return undefined;
    }

    const evidence: string[] = [];
    if (cms.size > 0) {
      evidence.push(`CMS markers detected: ${[...cms].join(', ')}`);
    }
    if (backendSignals.length > 0) {
      evidence.push(`Backend/server header exposed: ${backendSignals.join(', ')}`);
    }
    if (context.bodyTextLength >= 200) {
      evidence.push('Initial HTML already contains meaningful body text');
    }

    return this.createRenderingStrategy(
      'Server-rendered HTML',
      context.bodyTextLength >= 200 ? 85 : 70,
      evidence
    );
  }

  private static getClientFrameworkStrategy(
    frameworks: Set<string>,
    context: ReturnType<typeof TechnologyContextBuilder.build>
  ): DetectedTechnology | undefined {
    if (!frameworks.has('React') && !frameworks.has('Vue')) {
      return undefined;
    }

    if (context.bodyTextLength < 200) {
      return this.createRenderingStrategy('Likely client-rendered shell', 70, [
        'Frontend framework detected without strong SSR markers',
        `Initial HTML body text is sparse (${context.bodyTextLength} chars)`
      ]);
    }

    return this.createRenderingStrategy('Client framework with pre-rendered HTML', 65, [
      'Frontend framework detected',
      'Initial HTML still contains meaningful body text'
    ]);
  }

  private static createRenderingStrategy(name: string, confidence: number, evidence: string[]): DetectedTechnology {
    return {
      name,
      category: 'renderingStrategy',
      confidence,
      confidenceLevel: this.getConfidenceLevel(confidence),
      evidence
    };
  }

  private static sortSummary(summary: TechnologySummary): void {
    const categories: TechnologyCategory[] = [
      'frontendFramework',
      'renderingStrategy',
      'hosting',
      'cdn',
      'backend',
      'cms',
      'analytics',
      'uiLibraries',
      'buildTools',
      'fonts',
      'thirdPartyServices'
    ];

    for (const category of categories) {
      summary[category].sort((left, right) => {
        if (right.confidence !== left.confidence) {
          return right.confidence - left.confidence;
        }
        return left.name.localeCompare(right.name);
      });
    }
  }
}
