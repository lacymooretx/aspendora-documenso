import { describe, expect, it } from 'vitest';

import { NEXT_PUBLIC_WEBAPP_URL } from '../constants/app';
import { resolveSigningBaseUrl } from './signing-domain';

describe('resolveSigningBaseUrl', () => {
  const fallback = NEXT_PUBLIC_WEBAPP_URL();

  it('falls back to NEXT_PUBLIC_WEBAPP_URL when the domain is nullish or empty', () => {
    expect(resolveSigningBaseUrl(undefined)).toBe(fallback);
    expect(resolveSigningBaseUrl(null)).toBe(fallback);
    expect(resolveSigningBaseUrl('')).toBe(fallback);
    expect(resolveSigningBaseUrl('   ')).toBe(fallback);
  });

  it('returns a full https origin unchanged', () => {
    expect(resolveSigningBaseUrl('https://sign.example.com')).toBe('https://sign.example.com');
  });

  it('preserves an explicit http scheme (e.g. local/dev)', () => {
    expect(resolveSigningBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('adds https:// to a bare host', () => {
    expect(resolveSigningBaseUrl('sign.example.com')).toBe('https://sign.example.com');
  });

  it('strips trailing slashes so links do not double up', () => {
    expect(resolveSigningBaseUrl('https://sign.example.com/')).toBe('https://sign.example.com');
    expect(resolveSigningBaseUrl('https://sign.example.com///')).toBe('https://sign.example.com');
    expect(resolveSigningBaseUrl('sign.example.com/')).toBe('https://sign.example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveSigningBaseUrl('  https://sign.example.com  ')).toBe('https://sign.example.com');
  });

  it('composes into a valid signing link', () => {
    const baseUrl = resolveSigningBaseUrl('sign.aspendoracompliance.com');

    expect(`${baseUrl}/sign/token-123`).toBe('https://sign.aspendoracompliance.com/sign/token-123');
  });
});
