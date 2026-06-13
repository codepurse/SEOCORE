import { describe, it, expect } from 'vitest';
import { checkHttpsRedirect, checkSecurityTxt, securityGrade } from './index.js';

function mockFetch(handler: (url: string, opts: any) => any): typeof fetch {
  return (async (url: string, opts: any) => handler(url, opts)) as unknown as typeof fetch;
}

describe('securityGrade', () => {
  it('maps scores to letter grades matching the audit reporter', () => {
    expect(securityGrade(96)).toBe('A+');
    expect(securityGrade(90)).toBe('A');
    expect(securityGrade(85)).toBe('B');
    expect(securityGrade(72)).toBe('C');
    expect(securityGrade(61)).toBe('D');
    expect(securityGrade(55)).toBe('F');
  });
});

describe('checkHttpsRedirect', () => {
  it('flags when HTTP does not redirect to HTTPS', async () => {
    const fetchImpl = mockFetch(() => ({
      status: 200,
      ok: true,
      headers: new Map(),
    }));
    const finding = await checkHttpsRedirect('https://example.com/', fetchImpl);
    expect(finding).not.toBeNull();
    expect(finding?.subCheck).toBe('no-https-redirect');
    expect(finding?.severity).toBe('warning');
  });

  it('passes (null) when HTTP 301-redirects to HTTPS', async () => {
    const fetchImpl = mockFetch(() => ({
      status: 301,
      ok: false,
      headers: new Map([['location', 'https://example.com/']]),
    }));
    const finding = await checkHttpsRedirect('https://example.com/', fetchImpl);
    expect(finding).toBeNull();
  });

  it('returns null for non-HTTPS targets (covered by not-https rule)', async () => {
    const finding = await checkHttpsRedirect('http://example.com/', mockFetch(() => ({ status: 200, ok: true, headers: new Map() })));
    expect(finding).toBeNull();
  });

  it('returns null when the HTTP endpoint is unreachable', async () => {
    const fetchImpl = mockFetch(() => { throw new Error('ECONNREFUSED'); });
    const finding = await checkHttpsRedirect('https://example.com/', fetchImpl);
    expect(finding).toBeNull();
  });
});

describe('checkSecurityTxt', () => {
  it('flags when no security.txt exists at either path', async () => {
    const fetchImpl = mockFetch(() => ({ status: 404, ok: false, headers: new Map() }));
    const finding = await checkSecurityTxt('https://example.com/', fetchImpl);
    expect(finding).not.toBeNull();
    expect(finding?.subCheck).toBe('missing-security-txt');
    expect(finding?.severity).toBe('info');
  });

  it('passes (null) when /.well-known/security.txt is present', async () => {
    const fetchImpl = mockFetch((url: string) => ({
      status: url.includes('/.well-known/security.txt') ? 200 : 404,
      ok: url.includes('/.well-known/security.txt'),
      headers: new Map(),
    }));
    const finding = await checkSecurityTxt('https://example.com/', fetchImpl);
    expect(finding).toBeNull();
  });
});
