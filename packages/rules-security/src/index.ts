import type {
  Finding,
  NormalizedPage,
  Rule,
  RuleDefinition,
  RuleEvaluationContext,
  Severity,
} from '@seocore/sdk';
import { createFindingId, getRuleSettings } from '@seocore/rule-utils';
import * as cheerio from 'cheerio';
import { SECURITY_SUBCHECKS, type SecuritySubCheck } from './sub-checks.js';

function createSecurityFinding(
  definition: RuleDefinition,
  url: string,
  subCheck: SecuritySubCheck,
  severity: Severity,
  message: string,
  recommendation: string,
  evidence?: string,
  idDetails: string = subCheck,
): Finding {
  return {
    id: createFindingId(definition.id, url, idDetails),
    ruleId: definition.id,
    subCheck,
    severity,
    category: definition.category,
    url,
    message,
    recommendation,
    evidence,
    documentationLink: definition.documentationLink,
  };
}

export class SecurityRule implements Rule {
  definition: RuleDefinition = {
    id: 'security',
    name: 'Security & HTTPS Validation',
    description: 'Checks for HTTPS, mixed content, HSTS, and insecure forms.',
    category: 'security',
    module: 'security',
    defaultSeverity: 'error',
    defaultWeight: 8,
    documentationLink: 'https://seocore.dev/docs/rules/security',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const { enabled, severity } = getRuleSettings(this.definition, context.config);
    if (!enabled) {
      return [];
    }

    const findings: Finding[] = [];

    if (page.url.startsWith('http:')) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.NOT_HTTPS,
          'critical',
          'Page is not served over HTTPS.',
          'Enable HTTPS on your website and redirect all HTTP traffic to HTTPS.',
        ),
      );
    }

    if (page.html) {
      const $ = cheerio.load(page.html);
      const mixedContent: string[] = [];

      $('img[src^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('src') || '');
      });
      $('script[src^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('src') || '');
      });
      $('link[rel="stylesheet"][href^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('href') || '');
      });
      $('iframe[src^="http:"]').each((_, el) => {
        mixedContent.push($(el).attr('src') || '');
      });

      if (mixedContent.length > 0) {
        findings.push(
          createSecurityFinding(
            this.definition,
            page.url,
            SECURITY_SUBCHECKS.MIXED_CONTENT,
            severity,
            `Page contains ${mixedContent.length} mixed content resources.`,
            'Update all resources to use HTTPS URLs.',
            `Sample resources: ${mixedContent.slice(0, 3).join(', ')}`,
          ),
        );
      }

      let pageOrigin = '';
      try {
        pageOrigin = new URL(page.url).origin;
      } catch {
        // Ignore invalid page URL.
      }

      const checkSri = (selector: string, attr: string) => {
        $(selector).each((_, el) => {
          const src = $(el).attr(attr);
          if (!src || (!src.startsWith('http://') && !src.startsWith('https://'))) {
            return;
          }

          try {
            const srcOrigin = new URL(src).origin;
            if (srcOrigin !== pageOrigin) {
              const integrity = $(el).attr('integrity');
              if (!integrity) {
                findings.push(
                  createSecurityFinding(
                    this.definition,
                    page.url,
                    SECURITY_SUBCHECKS.MISSING_SRI,
                    'warning',
                    `Cross-origin resource "${src}" is missing Subresource Integrity (SRI) attribute.`,
                    'Add the "integrity" attribute with a cryptographic hash (SHA-256/384/512) to verify cross-origin scripts or stylesheets.',
                  ),
                );
              }
            }
          } catch {
            // Ignore invalid resource URL.
          }
        });
      };

      checkSri('script[src]', 'src');
      checkSri('link[rel="stylesheet"][href]', 'href');

      $('form[action^="http:"]').each((_, el) => {
        findings.push(
          createSecurityFinding(
            this.definition,
            page.url,
            SECURITY_SUBCHECKS.INSECURE_FORM,
            severity,
            'Page contains a form that submits to an insecure HTTP URL.',
            'Update the form action to use HTTPS.',
            `Form action: ${$(el).attr('action')}`,
          ),
        );
      });
    }

    return findings;
  }
}

export class SecurityHeadersRule implements Rule {
  definition: RuleDefinition = {
    id: 'security-headers',
    name: 'Security Headers Assessment',
    description: 'Checks for essential security headers like CSP, X-Frame-Options, Referrer-Policy, HSTS, and Permissions-Policy.',
    category: 'security',
    module: 'security',
    defaultSeverity: 'warning',
    defaultWeight: 6,
    documentationLink: 'https://seocore.dev/docs/rules/security-headers',
  };

  async evaluate(page: NormalizedPage, context: RuleEvaluationContext): Promise<Finding[]> {
    const settings = getRuleSettings(this.definition, context.config);
    if (!settings.enabled) {
      return [];
    }

    const findingSeverityOverrides = settings.findingSeverityOverrides ?? {};
    const findings: Finding[] = [];
    const headers = (page.headers ?? {}) as Record<string, string | string[]>;
    const normalizedHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
    }

    const headerKeys = Object.keys(normalizedHeaders);

    const getSeverity = (suffix: SecuritySubCheck, checkDefaultSev: Severity): Severity => {
      const key1 = `${this.definition.id}:${suffix}`;
      const key2 = suffix;
      if (findingSeverityOverrides[key1]) {
        return findingSeverityOverrides[key1];
      }
      if (findingSeverityOverrides[key2]) {
        return findingSeverityOverrides[key2];
      }

      const override = context.config.ruleOverrides?.[this.definition.id];
      if (override?.severity) {
        return override.severity;
      }

      return checkDefaultSev;
    };

    const parseCsp = (cspValue: string): Record<string, string[]> => {
      const directives: Record<string, string[]> = {};
      const parts = cspValue.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) {
          continue;
        }
        const tokens = trimmed.split(/\s+/);
        const name = tokens[0].toLowerCase();
        const values = tokens.slice(1);
        directives[name] = values;
      }
      return directives;
    };

    const cspValue = normalizedHeaders['content-security-policy'];
    const cspReportOnlyValue = normalizedHeaders['content-security-policy-report-only'];
    const activeCspValue = cspValue || cspReportOnlyValue;

    if (!cspValue && !cspReportOnlyValue) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_CSP,
          getSeverity(SECURITY_SUBCHECKS.MISSING_CSP, 'warning'),
          'Page is missing Content-Security-Policy (CSP) header.',
          'Add a CSP header to mitigate XSS and other code injection attacks.',
        ),
      );
    } else if (!cspValue && cspReportOnlyValue) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.CSP_REPORT_ONLY,
          getSeverity(SECURITY_SUBCHECKS.CSP_REPORT_ONLY, 'info'),
          'CSP is in report-only mode; enforce when ready.',
          'Review your Content-Security-Policy-Report-Only violations and migrate to an enforced Content-Security-Policy header.',
        ),
      );
    }

    let hasFrameAncestors = false;

    if (activeCspValue) {
      const cspDirectives = parseCsp(activeCspValue);

      const hasToken = (directive: string, token: string) => {
        const values = cspDirectives[directive];
        return values ? values.map((value) => value.replace(/['"]/g, '').toLowerCase()).includes(token) : false;
      };

      const hasWildcard = (directive: string) => {
        const values = cspDirectives[directive];
        return values ? values.includes('*') : false;
      };

      if (cspDirectives['script-src']) {
        if (hasToken('script-src', 'unsafe-inline')) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.CSP_UNSAFE_INLINE_SCRIPT,
              getSeverity(SECURITY_SUBCHECKS.CSP_UNSAFE_INLINE_SCRIPT, 'error'),
              'Content-Security-Policy allows "unsafe-inline" in script-src.',
              'Remove "unsafe-inline" from script-src and use nonces or hashes to authorize inline scripts.',
            ),
          );
        }
        if (hasToken('script-src', 'unsafe-eval')) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.CSP_UNSAFE_EVAL_SCRIPT,
              getSeverity(SECURITY_SUBCHECKS.CSP_UNSAFE_EVAL_SCRIPT, 'error'),
              'Content-Security-Policy allows "unsafe-eval" in script-src.',
              'Remove "unsafe-eval" from script-src to prevent dynamic code execution.',
            ),
          );
        }
        if (hasWildcard('script-src')) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.CSP_SCRIPT_SRC_WILDCARD,
              getSeverity(SECURITY_SUBCHECKS.CSP_SCRIPT_SRC_WILDCARD, 'error'),
              'Content-Security-Policy script-src allows wildcard source (*).',
              'Specify exact allowed domains in script-src instead of wildcard (*).',
            ),
          );
        }
      }

      if (cspDirectives['object-src']) {
        if (hasWildcard('object-src')) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.CSP_OBJECT_SRC_WILDCARD,
              getSeverity(SECURITY_SUBCHECKS.CSP_OBJECT_SRC_WILDCARD, 'error'),
              'Content-Security-Policy object-src allows wildcard source (*).',
              'Set object-src to "none" to disable plugins like Flash and Java.',
            ),
          );
        }
      } else {
        findings.push(
          createSecurityFinding(
            this.definition,
            page.url,
            SECURITY_SUBCHECKS.CSP_MISSING_OBJECT_SRC,
            getSeverity(SECURITY_SUBCHECKS.CSP_MISSING_OBJECT_SRC, 'warning'),
            'Content-Security-Policy is missing object-src directive.',
            'Add `object-src \'none\'` to disable obsolete and insecure browser plugins.',
          ),
        );
      }

      if (!cspDirectives['default-src']) {
        findings.push(
          createSecurityFinding(
            this.definition,
            page.url,
            SECURITY_SUBCHECKS.CSP_MISSING_DEFAULT_SRC,
            getSeverity(SECURITY_SUBCHECKS.CSP_MISSING_DEFAULT_SRC, 'warning'),
            'Content-Security-Policy is missing default-src directive.',
            'Add `default-src \'self\'` as a fallback directive for all resource types.',
          ),
        );
      }

      if (cspDirectives['frame-ancestors']) {
        hasFrameAncestors = true;
      } else {
        findings.push(
          createSecurityFinding(
            this.definition,
            page.url,
            SECURITY_SUBCHECKS.CSP_MISSING_FRAME_ANCESTORS,
            getSeverity(SECURITY_SUBCHECKS.CSP_MISSING_FRAME_ANCESTORS, 'info'),
            'Content-Security-Policy is missing frame-ancestors directive.',
            'Add `frame-ancestors` directive as a modern way to control where your site can be embedded.',
          ),
        );
      }
    }

    const hasXFrameOptions = normalizedHeaders['x-frame-options'];
    if (!hasXFrameOptions && !hasFrameAncestors) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_X_FRAME_OPTIONS,
          getSeverity(SECURITY_SUBCHECKS.MISSING_X_FRAME_OPTIONS, 'warning'),
          'Page is missing X-Frame-Options header.',
          'Add an X-Frame-Options header to prevent clickjacking attacks.',
        ),
      );
    }

    if (!headerKeys.includes('referrer-policy')) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_REFERRER_POLICY,
          getSeverity(SECURITY_SUBCHECKS.MISSING_REFERRER_POLICY, 'info'),
          'Page is missing Referrer-Policy header.',
          'Add a Referrer-Policy header to control what referrer information is sent with requests.',
        ),
      );
    }

    const isHttps = page.url.startsWith('https:');
    const hstsHeader = normalizedHeaders['strict-transport-security'];

    if (isHttps) {
      if (!hstsHeader) {
        findings.push(
          createSecurityFinding(
            this.definition,
            page.url,
            SECURITY_SUBCHECKS.MISSING_HSTS,
            getSeverity(SECURITY_SUBCHECKS.MISSING_HSTS, 'error'),
            'Page is missing HTTP Strict Transport Security (HSTS) header.',
            'Add the Strict-Transport-Security header to force clients to use HTTPS.',
          ),
        );
      } else {
        const directives = hstsHeader.split(';').map((directive) => directive.trim().toLowerCase());
        let maxAge: number | null = null;
        const maxAgeDirective = directives.find((directive) => directive.startsWith('max-age='));

        if (maxAgeDirective) {
          const match = maxAgeDirective.match(/max-age=(\d+)/);
          if (match) {
            maxAge = parseInt(match[1], 10);
          }
        }

        if (maxAge === null) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.HSTS_INVALID,
              getSeverity(SECURITY_SUBCHECKS.HSTS_INVALID, 'warning'),
              'HSTS header is missing a valid max-age directive.',
              'Configure Strict-Transport-Security with a valid max-age directive (e.g., max-age=31536000).',
            ),
          );
        } else if (maxAge < 31536000) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.HSTS_SHORT_MAX_AGE,
              getSeverity(SECURITY_SUBCHECKS.HSTS_SHORT_MAX_AGE, 'warning'),
              `HSTS max-age is less than 1 year (${maxAge} seconds).`,
              'Increase Strict-Transport-Security max-age to at least 1 year (31536000 seconds).',
            ),
          );
        }

        const hasSubdomains = directives.some((directive) => directive === 'includesubdomains');
        if (!hasSubdomains) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.HSTS_MISSING_SUBDOMAINS,
              getSeverity(SECURITY_SUBCHECKS.HSTS_MISSING_SUBDOMAINS, 'warning'),
              'HSTS header is missing the includeSubDomains directive.',
              'Add includeSubDomains to your Strict-Transport-Security header to protect all subdomains.',
            ),
          );
        }

        const hasPreload = directives.some((directive) => directive === 'preload');
        if (!hasPreload) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.HSTS_MISSING_PRELOAD,
              getSeverity(SECURITY_SUBCHECKS.HSTS_MISSING_PRELOAD, 'info'),
              'HSTS header is missing the preload directive.',
              'Add preload to your Strict-Transport-Security header to allow preloading in modern browsers.',
            ),
          );
        }
      }
    }

    const xContentTypeOptionsHeader = normalizedHeaders['x-content-type-options'];
    if (!xContentTypeOptionsHeader) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_X_CONTENT_TYPE_OPTIONS,
          getSeverity(SECURITY_SUBCHECKS.MISSING_X_CONTENT_TYPE_OPTIONS, 'warning'),
          'Page is missing X-Content-Type-Options header.',
          'Add `X-Content-Type-Options: nosniff` to prevent MIME sniffing attacks.',
        ),
      );
    } else if (xContentTypeOptionsHeader.trim().toLowerCase() !== 'nosniff') {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.INVALID_X_CONTENT_TYPE_OPTIONS,
          getSeverity(SECURITY_SUBCHECKS.INVALID_X_CONTENT_TYPE_OPTIONS, 'warning'),
          `X-Content-Type-Options has invalid value: "${xContentTypeOptionsHeader}".`,
          'Set `X-Content-Type-Options: nosniff` to prevent MIME sniffing attacks.',
        ),
      );
    }

    const permissionsPolicyHeader = normalizedHeaders['permissions-policy'];
    if (!permissionsPolicyHeader) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_PERMISSIONS_POLICY,
          getSeverity(SECURITY_SUBCHECKS.MISSING_PERMISSIONS_POLICY, 'info'),
          'Page is missing Permissions-Policy header.',
          'Add `Permissions-Policy` header to control browser feature access (camera, microphone, geolocation, etc.).',
        ),
      );
    }

    const coopHeader = normalizedHeaders['cross-origin-opener-policy'];
    if (!coopHeader) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_COOP,
          getSeverity(SECURITY_SUBCHECKS.MISSING_COOP, 'info'),
          'Page is missing Cross-Origin-Opener-Policy (COOP) header.',
          'Add `Cross-Origin-Opener-Policy: same-origin` to isolate your execution context.',
        ),
      );
    }

    const coepHeader = normalizedHeaders['cross-origin-embedder-policy'];
    if (!coepHeader) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_COEP,
          getSeverity(SECURITY_SUBCHECKS.MISSING_COEP, 'info'),
          'Page is missing Cross-Origin-Embedder-Policy (COEP) header.',
          'Add `Cross-Origin-Embedder-Policy: require-corp` to prevent loading resources without explicit permission.',
        ),
      );
    }

    const corpHeader = normalizedHeaders['cross-origin-resource-policy'];
    if (!corpHeader) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.MISSING_CORP,
          getSeverity(SECURITY_SUBCHECKS.MISSING_CORP, 'info'),
          'Page is missing Cross-Origin-Resource-Policy (CORP) header.',
          'Add `Cross-Origin-Resource-Policy: same-origin` or `same-site` to control which origins can load your resources.',
        ),
      );
    }

    const serverHeader = normalizedHeaders['server'];
    if (serverHeader && /\d/.test(serverHeader)) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.SERVER_VERSION_DISCLOSURE,
          getSeverity(SECURITY_SUBCHECKS.SERVER_VERSION_DISCLOSURE, 'info'),
          `Server header exposes software version: "${serverHeader}".`,
          'Configure your web server to hide specific software versions from the Server header.',
        ),
      );
    }

    const xPoweredByHeader = normalizedHeaders['x-powered-by'];
    if (xPoweredByHeader) {
      findings.push(
        createSecurityFinding(
          this.definition,
          page.url,
          SECURITY_SUBCHECKS.X_POWERED_BY_DISCLOSURE,
          getSeverity(SECURITY_SUBCHECKS.X_POWERED_BY_DISCLOSURE, 'info'),
          `X-Powered-By header is present: "${xPoweredByHeader}".`,
          'Remove the X-Powered-By header to prevent technology stack disclosure.',
        ),
      );
    }

    const setCookieHeader = headers['set-cookie'];
    if (setCookieHeader) {
      const cookieStrings = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

      for (const cookieString of cookieStrings) {
        const parts = cookieString.split(';').map((part) => part.trim());
        const namePart = parts[0] || '';
        const cookieName = namePart.split('=')[0] || 'Unknown';
        const isCookieSecure = parts.some((part) => part.toLowerCase() === 'secure');
        const isCookieHttpOnly = parts.some((part) => part.toLowerCase() === 'httponly');
        const hasSameSite = parts.some((part) => part.toLowerCase().startsWith('samesite='));

        if (isHttps && !isCookieSecure) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.COOKIE_MISSING_SECURE,
              getSeverity(SECURITY_SUBCHECKS.COOKIE_MISSING_SECURE, 'warning'),
              `Cookie "${cookieName}" is missing the Secure flag.`,
              `Add the "Secure" attribute to cookie "${cookieName}" to ensure it is only transmitted over HTTPS.`,
              undefined,
              `${SECURITY_SUBCHECKS.COOKIE_MISSING_SECURE}:${cookieName}`,
            ),
          );
        }

        if (!isCookieHttpOnly) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.COOKIE_MISSING_HTTP_ONLY,
              getSeverity(SECURITY_SUBCHECKS.COOKIE_MISSING_HTTP_ONLY, 'warning'),
              `Cookie "${cookieName}" is missing the HttpOnly flag.`,
              `Add the "HttpOnly" attribute to cookie "${cookieName}" to prevent client-side script access.`,
              undefined,
              `${SECURITY_SUBCHECKS.COOKIE_MISSING_HTTP_ONLY}:${cookieName}`,
            ),
          );
        }

        if (!hasSameSite) {
          findings.push(
            createSecurityFinding(
              this.definition,
              page.url,
              SECURITY_SUBCHECKS.COOKIE_MISSING_SAME_SITE,
              getSeverity(SECURITY_SUBCHECKS.COOKIE_MISSING_SAME_SITE, 'info'),
              `Cookie "${cookieName}" is missing the SameSite attribute.`,
              `Add "SameSite=Lax" or "SameSite=Strict" to cookie "${cookieName}" to mitigate CSRF attacks.`,
              undefined,
              `${SECURITY_SUBCHECKS.COOKIE_MISSING_SAME_SITE}:${cookieName}`,
            ),
          );
        }
      }
    }

    return findings;
  }
}

export function getSecurityRules(): Rule[] {
  return [new SecurityRule(), new SecurityHeadersRule()];
}

export { SECURITY_SUBCHECKS } from './sub-checks.js';
