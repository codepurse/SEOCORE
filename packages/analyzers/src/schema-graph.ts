export interface GraphNode {
  '@type': string;
  '@id'?: string;
  [key: string]: any;
}

export interface HierarchyNode {
  type: string;
  id?: string;
  property?: string;
  children: HierarchyNode[];
  isCircular?: boolean;
}

export class SchemaGraphStitcher {
  private idMap = new Map<string, GraphNode>();
  private allNodes: GraphNode[] = [];

  constructor() {}

  /**
   * Stitch a list of schemas into an entity graph and build its DAG hierarchy.
   */
  stitch(schemas: any[]): {
    nodes: GraphNode[];
    roots: GraphNode[];
    hierarchy: HierarchyNode[];
  } {
    this.idMap.clear();
    this.allNodes = [];

    // 1. ID Collector: catalog all objects with @id deeply
    for (const schema of schemas) {
      this.collectNodesDeep(schema);
    }

    // 2. Pointer Resolver & Loop Detector: resolve @id links
    const roots = this.resolveAndFindRoots();

    // 3. Hierarchy Mapper: build output DAG tree showing root nodes to leaf structures
    const hierarchy = this.buildHierarchy(roots);

    return {
      nodes: this.allNodes,
      roots,
      hierarchy,
    };
  }

  /**
   * Traverse schemas deeply to collect all nodes with an @id
   */
  private collectNodesDeep(val: any): void {
    if (!val || typeof val !== 'object') return;

    if (Array.isArray(val)) {
      for (const item of val) {
        this.collectNodesDeep(item);
      }
      return;
    }

    // If it has a type, treat it as a node
    if (val['@type']) {
      const node = val as GraphNode;
      const id = node['@id'];
      
      // Catalog if it has @id
      if (id && typeof id === 'string') {
        const existing = this.idMap.get(id);
        if (existing) {
          // Merge properties if duplicate IDs found
          Object.assign(existing, node);
        } else {
          this.idMap.set(id, node);
          this.allNodes.push(node);
        }
      } else {
        this.allNodes.push(node);
      }
    }

    // Recurse into properties
    for (const key of Object.keys(val)) {
      if (key !== '@id') {
        this.collectNodesDeep(val[key]);
      }
    }
  }

  /**
   * Replace reference properties with full linked objects and find root nodes.
   */
  private resolveAndFindRoots(): GraphNode[] {
    const referencedIds = new Set<string>();

    // Resolve pointers deeply
    for (const node of this.allNodes) {
      this.resolveNodePointers(node, referencedIds, new Set<any>());
    }

    // Root nodes are those NOT referenced by any other node
    const roots: GraphNode[] = [];
    for (const node of this.allNodes) {
      const id = node['@id'];
      if (!id || !referencedIds.has(id)) {
        roots.push(node);
      }
    }

    // Fallback: if all nodes are circular and referenced, return all top-level nodes of the original array
    if (roots.length === 0 && this.allNodes.length > 0) {
      return this.allNodes.slice(0, 3);
    }

    return roots;
  }

  private resolveNodePointers(val: any, referencedIds: Set<string>, seen: Set<any>): void {
    if (!val || typeof val !== 'object') return;
    if (seen.has(val)) return;
    seen.add(val);

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (item && typeof item === 'object' && item['@id'] && Object.keys(item).length === 1) {
          const targetId = item['@id'];
          const resolved = this.idMap.get(targetId);
          if (resolved) {
            val[i] = resolved;
            referencedIds.add(targetId);
          }
        } else {
          this.resolveNodePointers(item, referencedIds, seen);
        }
      }
      return;
    }

    for (const key of Object.keys(val)) {
      const propVal = val[key];
      if (propVal && typeof propVal === 'object') {
        const targetId = propVal['@id'];
        if (targetId && typeof targetId === 'string') {
          // If it's a reference only (or we resolve all matches)
          const resolved = this.idMap.get(targetId);
          if (resolved) {
            val[key] = resolved;
            referencedIds.add(targetId);
          }
        } else {
          this.resolveNodePointers(propVal, referencedIds, seen);
        }
      }
    }
  }

  /**
   * Build hierarchy representation (DAG) tracking cycles
   */
  private buildHierarchy(roots: GraphNode[]): HierarchyNode[] {
    const hierarchy: HierarchyNode[] = [];
    const visited = new Set<string>();

    for (const root of roots) {
      hierarchy.push(this.buildHierarchyNode(root, visited, undefined));
    }

    return hierarchy;
  }

  private buildHierarchyNode(node: any, visited: Set<string>, propertyName?: string): HierarchyNode {
    const type = node['@type'] || 'Thing';
    const id = node['@id'];

    const hNode: HierarchyNode = {
      type,
      id,
      property: propertyName,
      children: [],
    };

    if (id) {
      if (visited.has(id)) {
        hNode.isCircular = true;
        return hNode;
      }
      visited.add(id);
    }

    // Find children properties
    for (const key of Object.keys(node)) {
      if (key === '@id' || key === '@type' || key === '@context') continue;

      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && item['@type']) {
              hNode.children.push(this.buildHierarchyNode(item, new Set(visited), key));
            }
          }
        } else if (val['@type']) {
          hNode.children.push(this.buildHierarchyNode(val, new Set(visited), key));
        }
      }
    }

    return hNode;
  }
}
