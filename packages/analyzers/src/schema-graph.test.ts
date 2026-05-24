import { describe, it, expect } from 'vitest';
import { SchemaGraphStitcher } from './schema-graph';

describe('SchemaGraphStitcher', () => {
  it('should stitch nodes via pointers and handle circular references', () => {
    const stitcher = new SchemaGraphStitcher();
    const rawSchemas = [
      {
        '@type': 'Article',
        '@id': 'https://example.com/article#1',
        'headline': 'Stitched Graph Title',
        'author': {
          '@id': 'https://example.com/author#1'
        }
      },
      {
        '@type': 'Person',
        '@id': 'https://example.com/author#1',
        'name': 'Expert Author',
        'publisher': {
          '@id': 'https://example.com/organization#1'
        }
      },
      {
        '@type': 'Organization',
        '@id': 'https://example.com/organization#1',
        'name': 'Tech Corp',
        'member': {
          '@id': 'https://example.com/author#1' // Circular reference (Orga -> Member Person -> Publisher Orga)
        }
      }
    ];

    const stitched = stitcher.stitch(rawSchemas);

    expect(stitched.nodes.length).toBe(3);
    expect(stitched.roots.length).toBe(1);
    expect(stitched.roots[0]['@id']).toBe('https://example.com/article#1');
    
    // Author pointer resolved deeply
    const resolvedAuthor = stitched.roots[0].author;
    expect(resolvedAuthor.name).toBe('Expert Author');

    // Hierarchy mapped correctly with circular flag
    const hierarchy = stitched.hierarchy;
    expect(hierarchy.length).toBe(1);
    expect(hierarchy[0].type).toBe('Article');
    expect(hierarchy[0].children[0].type).toBe('Person');
    expect(hierarchy[0].children[0].children[0].type).toBe('Organization');
    expect(hierarchy[0].children[0].children[0].children[0].isCircular).toBe(true);
  });
});
