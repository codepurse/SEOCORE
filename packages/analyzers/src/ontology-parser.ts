export interface OntologyType {
  id: string;
  label: string;
  subClassOf: string[];
  properties: string[];
}

export interface OntologyProperty {
  id: string;
  label: string;
  domains: string[];
  ranges: string[];
}

export class DynamicOntologyParser {
  private types = new Map<string, OntologyType>();
  private properties = new Map<string, OntologyProperty>();

  constructor() {}

  /**
   * Compile a full Schema.org ontology definition in JSON-LD format
   */
  compile(ontologyJson: any): void {
    if (!ontologyJson || !Array.isArray(ontologyJson['@graph'])) {
      return;
    }

    const graph = ontologyJson['@graph'];

    // 1. First pass: Register all classes and properties
    for (const item of graph) {
      const type = item['@type'];
      const id = this.cleanUri(item['@id']);
      const label = item['rdfs:label'] || id;

      if (type === 'rdfs:Class' || (Array.isArray(type) && type.includes('rdfs:Class'))) {
        const subClassAttr = item['rdfs:subClassOf'];
        const subClassOf: string[] = [];
        
        if (subClassAttr) {
          if (Array.isArray(subClassAttr)) {
            subClassOf.push(...subClassAttr.map(sc => this.cleanUri(sc['@id'])));
          } else {
            subClassOf.push(this.cleanUri(subClassAttr['@id']));
          }
        }

        this.types.set(id, {
          id,
          label: typeof label === 'string' ? label : label['@value'] || id,
          subClassOf,
          properties: [],
        });
      } else if (type === 'rdf:Property' || (Array.isArray(type) && type.includes('rdf:Property'))) {
        const domainAttr = item['http://schema.org/domainIncludes'] || item['domainIncludes'];
        const rangeAttr = item['http://schema.org/rangeIncludes'] || item['rangeIncludes'];
        
        const domains: string[] = [];
        const ranges: string[] = [];

        if (domainAttr) {
          if (Array.isArray(domainAttr)) {
            domains.push(...domainAttr.map(d => this.cleanUri(scId(d))));
          } else {
            domains.push(this.cleanUri(scId(domainAttr)));
          }
        }

        if (rangeAttr) {
          if (Array.isArray(rangeAttr)) {
            ranges.push(...rangeAttr.map(r => this.cleanUri(scId(r))));
          } else {
            ranges.push(this.cleanUri(scId(rangeAttr)));
          }
        }

        this.properties.set(id, {
          id,
          label: typeof label === 'string' ? label : label['@value'] || id,
          domains,
          ranges,
        });
      }
    }

    // 2. Second pass: Associate properties with their domains (classes)
    for (const prop of this.properties.values()) {
      for (const domain of prop.domains) {
        const t = this.types.get(domain);
        if (t) {
          t.properties.push(prop.id);
        }
      }
    }
  }

  /**
   * Recursively get all valid properties for a type including inherited ones
   */
  getPropertiesForType(typeName: string): string[] {
    const type = this.types.get(typeName) || this.types.get('https://schema.org/' + typeName);
    if (!type) return [];

    const properties = new Set<string>([...type.properties]);
    for (const parent of type.subClassOf) {
      const parentProps = this.getPropertiesForType(parent);
      for (const p of parentProps) {
        properties.add(p);
      }
    }

    return Array.from(properties);
  }

  /**
   * Determine if a type is a subclass of another type
   */
  isSubClassOf(childType: string, parentType: string): boolean {
    if (childType === parentType) return true;

    const child = this.types.get(childType) || this.types.get('https://schema.org/' + childType);
    if (!child) return false;

    for (const parent of child.subClassOf) {
      if (parent === parentType || parent === 'https://schema.org/' + parentType) return true;
      if (this.isSubClassOf(parent, parentType)) return true;
    }

    return false;
  }

  private cleanUri(uri: string): string {
    if (!uri) return '';
    return uri.replace('http://schema.org/', 'https://schema.org/');
  }
}

function scId(obj: any): string {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj['@id'] || '';
}
