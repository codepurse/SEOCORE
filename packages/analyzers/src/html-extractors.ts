import * as cheerio from 'cheerio';

export interface ExtractedSchema {
  '@type': string;
  '@id'?: string;
  [key: string]: any;
}

/**
 * Extract Microdata from Cheerio DOM
 */
export function extractMicrodata($: cheerio.CheerioAPI): ExtractedSchema[] {
  const items: ExtractedSchema[] = [];

  $('[itemscope]').each((_, el) => {
    const $el = $(el);
    if ($el.parents('[itemscope]').length === 0) {
      const parsed = parseItem($el, $);
      if (parsed) {
        items.push(parsed);
      }
    }
  });

  return items;
}

function parseItem($el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): ExtractedSchema | null {
  const typeAttr = $el.attr('itemtype');
  const id = $el.attr('itemid');
  
  let type = 'Thing';
  if (typeAttr) {
    type = typeAttr.trim();
    if (type.startsWith('http://') || type.startsWith('https://')) {
      const parts = type.split('/');
      type = parts[parts.length - 1];
    }
  }

  const result: ExtractedSchema = {
    '@type': type
  };

  if (id) {
    result['@id'] = id.trim();
  }

  $el.find('[itemprop]').each((_index, propEl) => {
    const $propEl = $(propEl);
    
    // Ensure property belongs directly to this item
    const closestItemscope = $propEl.closest('[itemscope]');
    if (!closestItemscope.is($el)) {
      return;
    }

    const propName = $propEl.attr('itemprop');
    if (!propName) return;

    let value: any;
    if ($propEl.is('[itemscope]')) {
      value = parseItem($propEl, $);
    } else {
      value = getElementValue($propEl);
    }

    const propNames = propName.split(/\s+/);
    for (const name of propNames) {
      if (!name) continue;
      if (result[name] !== undefined) {
        if (Array.isArray(result[name])) {
          result[name].push(value);
        } else {
          result[name] = [result[name], value];
        }
      } else {
        result[name] = value;
      }
    }
  });

  return result;
}

function getElementValue($el: cheerio.Cheerio<any>): string {
  if ($el.is('meta')) {
    return $el.attr('content') || '';
  }
  if ($el.is('link')) {
    return $el.attr('href') || '';
  }
  if ($el.is('audio, embed, iframe, img, source, track, video')) {
    return $el.attr('src') || '';
  }
  if ($el.is('a, area')) {
    return $el.attr('href') || '';
  }
  if ($el.is('object')) {
    return $el.attr('data') || '';
  }
  if ($el.is('data, meter')) {
    return $el.attr('value') || '';
  }
  if ($el.is('time')) {
    return $el.attr('datetime') || $el.text().trim();
  }
  return $el.text().trim();
}

/**
 * Extract RDFa from Cheerio DOM
 */
export function extractRDFa($: cheerio.CheerioAPI): ExtractedSchema[] {
  const items: ExtractedSchema[] = [];

  $('[typeof]').each((_, el) => {
    const $el = $(el);
    if ($el.parents('[typeof]').length === 0) {
      const parsed = parseRdfaItem($el, $);
      if (parsed) {
        items.push(parsed);
      }
    }
  });

  return items;
}

function parseRdfaItem($el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): ExtractedSchema | null {
  let typeAttr = $el.attr('typeof');
  const resource = $el.attr('resource') || $el.attr('about');
  
  let type = 'Thing';
  if (typeAttr) {
    typeAttr = typeAttr.trim();
    if (typeAttr.startsWith('http://') || typeAttr.startsWith('https://')) {
      const parts = typeAttr.split('/');
      type = parts[parts.length - 1];
    } else {
      type = typeAttr;
    }
  }

  const result: ExtractedSchema = {
    '@type': type
  };

  if (resource) {
    result['@id'] = resource.trim();
  }

  $el.find('[property]').each((_index, propEl) => {
    const $propEl = $(propEl);
    
    const closestTypeof = $propEl.closest('[typeof]');
    if (!closestTypeof.is($el)) {
      return;
    }

    const propName = $propEl.attr('property');
    if (!propName) return;

    let value: any;
    if ($propEl.is('[typeof]')) {
      value = parseRdfaItem($propEl, $);
    } else {
      value = getRdfaValue($propEl);
    }

    const propNames = propName.split(/\s+/);
    for (const name of propNames) {
      if (!name) continue;
      let cleanName = name;
      if (cleanName.includes(':')) {
        cleanName = cleanName.split(':')[1];
      }

      if (result[cleanName] !== undefined) {
        if (Array.isArray(result[cleanName])) {
          result[cleanName].push(value);
        } else {
          result[cleanName] = [result[cleanName], value];
        }
      } else {
        result[cleanName] = value;
      }
    }
  });

  return result;
}

function getRdfaValue($el: cheerio.Cheerio<any>): string {
  const content = $el.attr('content');
  if (content !== undefined) return content;

  if ($el.is('audio, embed, iframe, img, source, track, video')) {
    return $el.attr('src') || '';
  }
  if ($el.is('a, area, link')) {
    return $el.attr('href') || '';
  }
  if ($el.is('object')) {
    return $el.attr('data') || '';
  }
  if ($el.is('data, meter')) {
    return $el.attr('value') || '';
  }
  if ($el.is('time')) {
    return $el.attr('datetime') || $el.text().trim();
  }
  return $el.text().trim();
}

/**
 * Deep merge utility for two schema objects
 */
export function deepMerge(target: any, source: any): any {
  if (target === source) return target;
  if (!target || typeof target !== 'object') return source;
  if (!source || typeof source !== 'object') return target;

  if (Array.isArray(target) || Array.isArray(source)) {
    const tArr = Array.isArray(target) ? target : [target];
    const sArr = Array.isArray(source) ? source : [source];
    const combined = [...tArr, ...sArr];
    // Deduplicate primitives/objects
    const seen = new Set<string>();
    return combined.filter(item => {
      const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const merged = { ...target };
  for (const key of Object.keys(source)) {
    if (key === '@id' || key === '@type') {
      if (!merged[key]) merged[key] = source[key];
    } else if (merged[key] !== undefined) {
      merged[key] = deepMerge(merged[key], source[key]);
    } else {
      merged[key] = source[key];
    }
  }
  return merged;
}

/**
 * Normalizer Bridge: Merge raw schema elements from multiple sources and formats
 */
export function mergeSchemas(schemas: any[]): any[] {
  const idMap = new Map<string, ExtractedSchema>();
  const typelessMap = new Map<string, ExtractedSchema[]>();
  const merged: any[] = [];
  const errors: any[] = [];

  for (const schema of schemas) {
    if (!schema) continue;

    if (schema.__error) {
      errors.push(schema);
      continue;
    }

    // Normalize types and context
    let sType = schema['@type'] || 'Thing';
    if (sType.startsWith('http://') || sType.startsWith('https://')) {
      const parts = sType.split('/');
      sType = parts[parts.length - 1];
    }
    schema['@type'] = sType;

    const id = schema['@id'];
    if (id) {
      const existing = idMap.get(id);
      if (existing) {
        idMap.set(id, deepMerge(existing, schema));
      } else {
        idMap.set(id, schema);
      }
    } else {
      const list = typelessMap.get(sType) || [];
      list.push(schema);
      typelessMap.set(sType, list);
    }
  }

  // Add all ID-ed elements
  for (const val of idMap.values()) {
    merged.push(val);
  }

  // Merge identical/similar typeless elements or push them
  for (const [type, list] of typelessMap.entries()) {
    const uniqueList: ExtractedSchema[] = [];
    for (const schema of list) {
      let isMerged = false;
      for (let i = 0; i < uniqueList.length; i++) {
        // Simple heuristic: if key overlap is high and values match, merge
        const u = uniqueList[i];
        const uKeys = Object.keys(u).filter(k => k !== '@type');
        const sKeys = Object.keys(schema).filter(k => k !== '@type');
        const commonKeys = uKeys.filter(k => sKeys.includes(k));
        
        if (commonKeys.length > 0 && commonKeys.every(k => JSON.stringify(u[k]) === JSON.stringify(schema[k]))) {
          uniqueList[i] = deepMerge(u, schema);
          isMerged = true;
          break;
        }
      }
      if (!isMerged) {
        uniqueList.push(schema);
      }
    }
    merged.push(...uniqueList);
  }

  return [...merged, ...errors];
}
