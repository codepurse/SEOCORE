import { describe, it, expect } from 'vitest';
import { flattenSchema, extractSchemaTypes, hasSchemaType, createFindingId, getRuleSettings } from './index.js';

describe('schema-helpers', () => {
  it('flattens nested @graph schemas', () => {
    const schema = {
      '@type': 'Organization',
      '@graph': [
        { '@type': 'Person' },
        { '@type': 'Product' }
      ]
    };
    expect(flattenSchema(schema)).toHaveLength(3);
  });

  it('extracts schema types', () => {
    const schemas = [{ '@type': 'Article' }, { '@type': 'Product' }];
    expect(extractSchemaTypes(schemas)).toEqual(['article', 'product']);
  });

  it('checks for schema type presence', () => {
    const schemas = [{ '@type': 'Organization' }];
    expect(hasSchemaType(schemas, 'organization')).toBe(true);
    expect(hasSchemaType(schemas, 'person')).toBe(false);
  });
});

describe('finding-helpers', () => {
  it('creates deterministic finding IDs', () => {
    const id1 = createFindingId('rule-1', 'https://example.com');
    const id2 = createFindingId('rule-1', 'https://example.com');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^rule-1:/);
  });

  it('creates unique IDs with details', () => {
    const id1 = createFindingId('rule-1', 'https://example.com', 'detail-a');
    const id2 = createFindingId('rule-1', 'https://example.com', 'detail-b');
    expect(id1).not.toBe(id2);
  });

  it('resolves rule settings with defaults', () => {
    const def = {
      id: 'test-rule',
      name: 'Test',
      description: 'Test rule',
      category: 'seo' as const,
      defaultSeverity: 'warning' as const,
      defaultWeight: 5,
    };
    const settings = getRuleSettings(def, {});
    expect(settings.enabled).toBe(true);
    expect(settings.severity).toBe('warning');
    expect(settings.weight).toBe(5);
  });
});
