import { NEXT_PUBLIC_WEBAPP_URL } from '../constants/app';

/**
 * Resolve the base URL used for signer-facing links (the signing page, the report
 * page, and the completion download link) for a given organisation/team.
 *
 * When an organisation configures a custom signing domain, its signer-facing links
 * are emitted on that vanity domain, so a single Documenso instance can serve multiple
 * signing domains. When unset, links fall back to the global `NEXT_PUBLIC_WEBAPP_URL`.
 *
 * The stored value is normalised to a full origin: a bare host such as
 * `sign.example.com` is treated as `https://sign.example.com`, and any trailing
 * slashes are stripped. This is only for signer-facing links — internal owner
 * dashboard links, email asset URLs, and auth callbacks intentionally stay on the
 * canonical `NEXT_PUBLIC_WEBAPP_URL`.
 */
export const resolveSigningBaseUrl = (customSigningDomain?: string | null): string => {
  const fallback = NEXT_PUBLIC_WEBAPP_URL();

  if (!customSigningDomain) {
    return fallback;
  }

  const trimmed = customSigningDomain.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return fallback;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};
