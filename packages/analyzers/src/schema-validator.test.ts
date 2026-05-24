import { describe, it, expect } from 'vitest';
import { SchemaValidator } from './schema-validator';

describe('SchemaValidator', () => {
  it('should run required/recommended checks, E-E-A-T and Integrity cross checks', () => {
    const validator = new SchemaValidator();

    // Mock HTML page metadata for cross-checking
    const mockPage = {
      title: 'Valid Product Title',
      canonical: 'https://example.com/product',
      openGraph: {
        'title': 'Valid Product Title',
        'price:amount': '49.99',
        'price:currency': 'USD'
      }
    };

    const structuredData = [
      {
        '@type': 'Product',
        'name': 'Different Product Title', // Integrity mismatch (different from mockPage.title)
        'offers': {
          '@type': 'Offer',
          'price': '99.99', // Integrity mismatch (different from mockPage price:amount)
          'priceCurrency': 'USD'
        }
      }
    ];

    const result = validator.validate(structuredData, 'https://example.com/product', mockPage);

    expect(result.totalSchemas).toBe(1);
    
    const productIssues = result.schemas[0].issues;
    const integrityAlerts = productIssues.filter(i => i.message.startsWith('Integrity Alert'));
    expect(integrityAlerts.length).toBeGreaterThanOrEqual(2);

    // E-E-A-T check: Product is not person/org, but let's check a Person with missing sameAs
    const eeatPerson = [
      {
        '@type': 'Person',
        'name': 'Sunny AI'
      }
    ];
    const personResult = validator.validate(eeatPerson, 'https://example.com/author');
    const personIssues = personResult.schemas[0].issues;
    expect(personIssues.some(i => i.message.includes('E-E-A-T'))).toBe(true);
  });
});
