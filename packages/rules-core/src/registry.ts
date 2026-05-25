import type { Rule } from '@seocore/sdk';
import { MissingTitleRule } from './metadata/title.js';
import { MissingMetaDescriptionRule } from './metadata/meta-description.js';

// TODO: import other rules (canonical, social-meta, headings, links, images, internal-linking, robots-txt, sitemap, noindex, hreflang, https)

export function getCoreRules(): Rule[] {
  return [
    new MissingTitleRule(),
    new MissingMetaDescriptionRule(),
    // TODO: instantiate other rules
  ];
}
