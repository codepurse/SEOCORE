import { ImageRecord, ImageFinding, ImageRule, ImageRuleContext } from '../types.js';

export const ResponsiveRule: ImageRule = {
  id: 'image-responsive',
  name: 'Responsive Variants and Srcset Usage',
  evaluate(images: ImageRecord[], context: ImageRuleContext): ImageFinding[] {
    const findings: ImageFinding[] = [];

    for (const img of images) {
      if (img.fetchFailed) continue;

      const width = img.decodedWidth || img.width;
      
      // Rule: Image wider than 600px without responsive srcset
      if (width && width > 600) {
        // Find if there are other sizes of this image (or if this image contains a srcset)
        // Wait, does the original img have a srcset? We can check if any other record has the same pathname but different width,
        // or check if we have any other evidence of srcset.
        // Actually, we can check if the image has srcset or is preloaded or belongs to picture.
        // But simply: if we detected it, and we don't see any other records for it, or it doesn't have srcset.
        // Since we extracted srcset into separate records, we can check if there are other records sharing a similar file base name!
        // To keep it simple and robust, let's check if the image itself has a 'srcset' attribute.
        // Wait, does the image have a srcset? In our ImageRecord, we extracted srcset as separate images.
        // Let's check if the record was derived from a srcset, or we can just look up records matching the same prefix, or simply flag if it's > 600px and has no other sizes in the records.
        // Better yet: let's flag if an image has a large intrinsic size but is rendered much smaller, and suggest srcset (which DeliveryRule does),
        // and here we can flag if any image has width > 600px and there are no other image records with similar path but different sizes.
        // Let's search if any other image has the same pathname but different width:
        let pathName = '';
        try { pathName = new URL(img.src).pathname.split('-')[0].split('_')[0]; } catch {}

        const hasOtherVariants = pathName ? images.some(other => 
          other.src !== img.src && 
          other.src.includes(pathName)
        ) : false;

        if (!hasOtherVariants) {
          findings.push({
            ruleId: this.id,
            imageSrc: img.src,
            severity: 'info',
            message: `Large image (${width}px wide) is served without responsive variants.`,
            recommendation: 'Use the srcset and sizes attributes on your <img> elements to serve resized variants. This allows mobile users to download smaller files than desktop users, saving up to 70% of bandwidth.',
            evidence: `Width: ${width}px. Responsive variants: none detected.`,
          });
        }
      }
    }

    return findings;
  }
};
