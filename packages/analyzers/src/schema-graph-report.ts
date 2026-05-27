import { NormalizedPage } from '@seocore/sdk';
import { SchemaGraphStitcher } from '@seocore/analyzers';

export interface SchemaEntityNode {
  type: string;
  id?: string;
  url?: string;
  properties: Record<string, any>;
  hasReferences: boolean;
  hasUnresolvedRefs: boolean;
}

export interface SchemaEntityEdge {
  from: { type: string; id?: string };
  to: { type: string; id?: string };
  property: string;
  resolved: boolean;
}

export interface UnresolvedSchemaReference {
  sourceType: string;
  sourceId?: string;
  targetId: string;
  property: string;
}

export interface SchemaEntityConflict {
  type: string;
  id?: string;
  conflictingProperties: { property: string; values: any[] }[];
}

export interface SchemaCoverageSummary {
  totalEntities: number;
  totalReferences: number;
  resolvedReferences: number;
  unresolvedReferences: number;
  coveragePercent: number;
  typesPresent: string[];
  typesExpected: string[];
  missingTypes: string[];
}

export interface SchemaGraphAnalysisResult {
  url: string;
  generatedAt: string;
  nodes: SchemaEntityNode[];
  edges: SchemaEntityEdge[];
  isolatedNodes: SchemaEntityNode[];
  unresolvedReferences: UnresolvedSchemaReference[];
  conflicts: SchemaEntityConflict[];
  coverage: SchemaCoverageSummary;
}

const IMPORTANT_ENTITY_TYPES = [
  'Organization',
  'WebSite',
  'WebPage',
  'Article',
  'BreadcrumbList',
  'Product',
  'Person',
  'VideoObject',
  'ImageObject',
  'FAQPage',
  'HowTo',
  'LocalBusiness',
  'Event',
];

export class SchemaGraphAnalyzer {
  private idMap = new Map<string, any>();
  private allNodes: any[] = [];
  private unresolvedRefs: UnresolvedSchemaReference[] = [];
  private conflicts: SchemaEntityConflict[] = [];
  private edges: SchemaEntityEdge[] = [];

  analyze(pages: Record<string, NormalizedPage>, url: string): SchemaGraphAnalysisResult {
    this.reset();
    
    for (const page of Object.values(pages)) {
      if (page.structuredData && Array.isArray(page.structuredData)) {
        for (const schema of page.structuredData) {
          this.collectNodesDeep(schema);
        }
      }
    }

    this.resolveReferences();
    this.detectConflicts();
    this.buildEdges();

    const nodes = this.extractNodes();
    const isolatedNodes = this.findIsolatedNodes(nodes);
    const coverage = this.calculateCoverage();

    return {
      url,
      generatedAt: new Date().toISOString(),
      nodes,
      edges: this.edges,
      isolatedNodes,
      unresolvedReferences: this.unresolvedRefs,
      conflicts: this.conflicts,
      coverage,
    };
  }

  private reset(): void {
    this.idMap.clear();
    this.allNodes = [];
    this.unresolvedRefs = [];
    this.conflicts = [];
    this.edges = [];
  }

  private collectNodesDeep(val: any, parent?: any, parentProp?: string): void {
    if (!val || typeof val !== 'object') return;

    if (Array.isArray(val)) {
      for (const item of val) {
        this.collectNodesDeep(item, parent, parentProp);
      }
      return;
    }

    if (val['@type']) {
      const node = { ...val };
      const id = node['@id'];

      if (id && typeof id === 'string') {
        const existing = this.idMap.get(id);
        if (existing) {
          Object.assign(existing, node);
        } else {
          this.idMap.set(id, node);
          this.allNodes.push(node);
        }
      } else {
        this.allNodes.push(node);
      }
    }

    for (const key of Object.keys(val)) {
      if (key !== '@id') {
        this.collectNodesDeep(val[key], val, key);
      }
    }
  }

  private resolveReferences(): void {
    for (const node of this.allNodes) {
      for (const key of Object.keys(node)) {
        if (key === '@id' || key === '@type' || key === '@context') continue;

        const propVal = node[key];
        if (propVal && typeof propVal === 'object') {
          if (Array.isArray(propVal)) {
            for (const item of propVal) {
              if (item && typeof item === 'object' && item['@id'] && Object.keys(item).length === 1) {
                const targetId = item['@id'];
                const resolved = this.idMap.get(targetId);
                if (resolved) {
                  const index = propVal.indexOf(item);
                  propVal[index] = resolved;
                } else {
                  this.unresolvedRefs.push({
                    sourceType: node['@type'] || 'Unknown',
                    sourceId: node['@id'],
                    targetId,
                    property: key,
                  });
                }
              }
            }
          } else if (propVal['@id'] && Object.keys(propVal).length === 1) {
            const targetId = propVal['@id'];
            const resolved = this.idMap.get(targetId);
            if (resolved) {
              node[key] = resolved;
            } else {
              this.unresolvedRefs.push({
                sourceType: node['@type'] || 'Unknown',
                sourceId: node['@id'],
                targetId,
                property: key,
              });
            }
          }
        }
      }
    }
  }

  private detectConflicts(): void {
    const typeGroups = new Map<string, any[]>();

    for (const node of this.allNodes) {
      const type = node['@type'];
      if (!type) continue;

      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(node);
    }

    for (const [type, nodes] of typeGroups) {
      if (nodes.length < 2) continue;

      const idGroups = new Map<string | undefined, any[]>();
      for (const node of nodes) {
        const id = node['@id'];
        if (!idGroups.has(id)) {
          idGroups.set(id, []);
        }
        idGroups.get(id)!.push(node);
      }

      for (const [, sameIdNodes] of idGroups) {
        if (sameIdNodes.length < 2) continue;

        const conflictingProps: { property: string; values: any[] }[] = [];
        const allKeys = new Set<string>();

        for (const node of sameIdNodes) {
          for (const key of Object.keys(node)) {
            if (key !== '@id' && key !== '@type' && key !== '@context') {
              allKeys.add(key);
            }
          }
        }

        for (const prop of allKeys) {
          const values = new Set<string>();
          for (const node of sameIdNodes) {
            if (node[prop] !== undefined) {
              const valStr = JSON.stringify(node[prop]);
              values.add(valStr);
            }
          }
          if (values.size > 1) {
            conflictingProps.push({
              property: prop,
              values: sameIdNodes.map(n => n[prop]).filter(v => v !== undefined),
            });
          }
        }

        if (conflictingProps.length > 0) {
          this.conflicts.push({
            type,
            id: sameIdNodes[0]['@id'],
            conflictingProperties: conflictingProps,
          });
        }
      }
    }
  }

  private buildEdges(): void {
    for (const node of this.allNodes) {
      const fromId = node['@id'];
      const fromType = node['@type'];

      for (const key of Object.keys(node)) {
        if (key === '@id' || key === '@type' || key === '@context') continue;

        const propVal = node[key];
        if (propVal && typeof propVal === 'object') {
          const targets = Array.isArray(propVal) ? propVal : [propVal];
          for (const target of targets) {
            if (target && typeof target === 'object' && target['@type']) {
              const resolved = this.idMap.get(target['@id']) || target;
              this.edges.push({
                from: { type: fromType, id: fromId },
                to: { type: resolved['@type'], id: resolved['@id'] },
                property: key,
                resolved: !!resolved['@id'],
              });
            }
          }
        }
      }
    }
  }

  private extractNodes(): SchemaEntityNode[] {
    return this.allNodes.map(node => {
      const properties: Record<string, any> = {};
      for (const key of Object.keys(node)) {
        if (key !== '@id' && key !== '@type' && key !== '@context') {
          let value = node[key];
          if (typeof value === 'object' && value !== null) {
            if (value['@id'] && Object.keys(value).length === 1) {
              value = `{@id: ${value['@id']}}`;
            } else if (Array.isArray(value)) {
              value = value.map(item => {
                if (item && typeof item === 'object' && item['@id'] && Object.keys(item).length === 1) {
                  return `{@id: ${item['@id']}}`;
                }
                return item;
              });
            }
          }
          properties[key] = value;
        }
      }

      const hasUnresolvedRefs = this.unresolvedRefs.some(
        r => r.sourceId === node['@id'] || r.sourceType === node['@type']
      );

      return {
        type: node['@type'] || 'Thing',
        id: node['@id'],
        properties,
        hasReferences: this.edges.some(e => e.from.id === node['@id']),
        hasUnresolvedRefs,
      };
    });
  }

  private findIsolatedNodes(nodes: SchemaEntityNode[]): SchemaEntityNode[] {
    const connectedIds = new Set<string>();
    for (const edge of this.edges) {
      if (edge.from.id) connectedIds.add(edge.from.id);
      if (edge.to.id) connectedIds.add(edge.to.id);
    }

    return nodes.filter(node => {
      if (node.id) {
        return !connectedIds.has(node.id);
      }
      return false;
    });
  }

  private calculateCoverage(): SchemaCoverageSummary {
    const typesPresent = new Set<string>();
    for (const node of this.allNodes) {
      if (node['@type']) {
        typesPresent.add(node['@type']);
      }
    }

    const missingTypes = IMPORTANT_ENTITY_TYPES.filter(
      t => !typesPresent.has(t)
    );

    const totalEntities = this.allNodes.length;
    const totalReferences = this.edges.length;
    const resolvedReferences = this.edges.filter(e => e.resolved).length;
    const unresolvedCount = this.unresolvedRefs.length;
    const coveragePercent = totalReferences > 0
      ? Math.round((resolvedReferences / totalReferences) * 100)
      : 100;

    return {
      totalEntities,
      totalReferences,
      resolvedReferences,
      unresolvedReferences: unresolvedCount,
      coveragePercent,
      typesPresent: Array.from(typesPresent).sort(),
      typesExpected: IMPORTANT_ENTITY_TYPES,
      missingTypes,
    };
  }
}
