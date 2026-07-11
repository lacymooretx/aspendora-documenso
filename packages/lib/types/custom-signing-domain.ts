import { z } from 'zod';

export const CUSTOM_SIGNING_DOMAIN_MAX_LENGTH = 255;

/**
 * Whether a user-supplied custom signing domain is well-formed.
 *
 * Accepts either a bare host (`sign.example.com`) or a full http(s) origin
 * (`https://sign.example.com`). Rejects anything carrying a path, query, or
 * fragment, and anything that is not a parseable hostname. An empty string is
 * considered valid here (it is normalised to "clear" by the schema below).
 */
export const isValidCustomSigningDomain = (value: string): boolean => {
  if (value === '') {
    return true;
  }

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  let url: URL;

  try {
    url = new URL(withScheme);
  } catch {
    return false;
  }

  // Must be a plain origin: no path, query, or fragment, and a real hostname.
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.hostname.length > 0 &&
    (url.pathname === '' || url.pathname === '/') &&
    url.search === '' &&
    url.hash === '' &&
    // Guard against `user:pass@` and other origin oddities.
    url.username === '' &&
    url.password === ''
  );
};

/**
 * Validates a custom signing domain and normalises an empty string to `null`
 * (meaning "no custom domain — fall back to NEXT_PUBLIC_WEBAPP_URL"). Wrap with
 * `.nullish()` at the call-site so `undefined` means "leave unchanged".
 */
export const ZCustomSigningDomainSchema = z
  .string()
  .trim()
  .max(CUSTOM_SIGNING_DOMAIN_MAX_LENGTH)
  .refine(isValidCustomSigningDomain, {
    message: 'Enter a valid domain, e.g. sign.example.com',
  })
  .transform((value) => (value.length === 0 ? null : value));
