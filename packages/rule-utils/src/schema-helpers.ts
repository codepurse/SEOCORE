export function flattenSchema(schema: any): any[] {
  if (!schema) return [];
  if (Array.isArray(schema)) {
    return schema.reduce((acc, curr) => acc.concat(flattenSchema(curr)), []);
  }
  const result = [schema];
  if (schema['@graph'] && Array.isArray(schema['@graph'])) {
    result.push(...flattenSchema(schema['@graph']));
  }
  return result;
}

export function extractSchemaTypes(schema: any[]): string[] {
  return flattenSchema(schema)
    .map(item => item?.['@type'])
    .filter(Boolean)
    .map(t => String(t).toLowerCase());
}

export function hasSchemaType(schema: any[], type: string): boolean {
  return extractSchemaTypes(schema).includes(type.toLowerCase());
}
