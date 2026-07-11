# App Build Progress — Per-Organisation Custom Signing Domain

**Goal:** Let a **single** Documenso instance emit signer-facing links on **per-organisation vanity
domains**, so the separate MSP (`sign.aspendora.com`) and Compliance (`sign.aspendoracompliance.com`)
instances can collapse into one. Priority: our ops (consolidation). Upstream PR: nice-to-have only
(upstream declared custom domains out-of-scope in issue #1059 → "self-host").

---

## Architecture summary (from subsystem mapping, 2026-07-11)

What already works with **no code change** (configuration only):
- **Per-org sender identity + DKIM** — `EmailDomain` + `OrganisationEmail` + `getEmailContext`
  custom-domain branch (`packages/lib/server-only/email/get-email-context.ts:165-176`); SES BYODKIM
  at provision time. Compliance already sends as its own address.
- **Signing page on a vanity host** — `/sign/:token`, `/d/:token`, embed are token-authenticated &
  anonymous (`getOptionalSession`); branding resolves from the token's envelope→team→org
  (host-relative `/api/branding/logo/...`); CSP on `/sign`,`/d` allows it. A vanity domain is just a
  second CNAME to the same instance; **any token works on any host** — no host→org routing needed.

The **only gap**: signer-facing links in emails come from the global `NEXT_PUBLIC_WEBAPP_URL()`.
Single choke-point: **`getEmailContext`** already loads org + settings for every signer email.

**Out of scope for v1 (documented limitation, not solved):** authenticated flows on the vanity host
(staff login / passkey / OAuth callbacks / WebAuthn rpID / auth-cookie domain) are pinned to the
canonical host (`packages/lib/constants/auth.ts:83`, `packages/auth/server/index.ts:24-36`,
`packages/auth/server/config.ts:23-43`). Staff log in on the canonical host; signers are anonymous.
The only casualty is a document with `DocumentAccessAuth.ACCOUNT` opened on the vanity host — our
onboarding consent flow does not use it.

**Signer-facing link sites to rewrite → `baseUrl` (from getEmailContext), all others stay canonical:**
- `packages/lib/jobs/definitions/emails/send-signing-email.handler.ts:168-169` (`/sign`, `/report`)
- `packages/lib/server-only/document/resend-document.ts:242-243` (`/sign`, `/report`)
- `packages/lib/jobs/definitions/internal/process-signing-reminder.handler.ts:159-160` (`/sign`,`/report`)
- `packages/lib/jobs/definitions/emails/send-document-completed-emails.handler.ts:212,214`
  (`/sign/:token/complete` to signer, `/report/:token` to CC) — leave owner `/t/...` links canonical.
- (verify `send-pending-email.ts` for a `/sign` link)
Keep canonical: email `assetBaseUrl` (logo images), all owner `/t/:teamUrl/...` dashboard links, the
sealed-PDF QR `/share/:qrToken` (`render-certificate.ts:605` — permanent artifact, stability > vanity).

---

## Phases

### Phase 1 — Core plumbing (makes consolidation work)  ▸ STATUS: ✅ DONE (2026-07-11)
- Add `customSigningDomain String?` to `OrganisationGlobalSettings` (Prisma) + migration.
- Add `resolveSigningBaseUrl(customSigningDomain)` helper (fallback to `NEXT_PUBLIC_WEBAPP_URL()`;
  require `https://` in production; strip trailing slash).
- Compute `baseUrl` in `getEmailContext` (`handleTeamEmailContext` + `handleOrganisationEmailContext`)
  and add to `EmailContextResponse`.
- Swap the ~7 signer-facing link lines above to `${baseUrl}/...`.
- **Verify:** build + typecheck; unit-test `resolveSigningBaseUrl`; render the signing email in a test
  and assert the link host. Setting the DB field by hand then makes consolidation live.
- **Approval gate → STOP.**

### Phase 2 — Admin UX + secondary links  ▸ STATUS: ✅ DONE (admin UI+tRPC); copy-link threading DEFERRED (documented)
- tRPC read/update for `customSigningDomain` on the org settings router (super-admin/org-admin) with
  domain-format validation.
- Settings UI input on the organisation email/branding settings page.
- Thread the org base URL into UI copy-link + direct-template sites (`formatSigningLink` /
  `formatDirectTemplatePath` optional baseUrl) for manual (`distributionMethod = NONE`) sharing.
- **Verify:** e2e drive the settings form; copy-link reflects the org domain. **Approval gate → STOP.**

### Phase 3 — Hardening + rollout + optional PR shaping  ▸ STATUS: ◑ docs done; live DB apply + PR pending user
- Decide QR/certificate + file-download (`envelope-download.ts`) domain policy.
- Optional: host allowlist for `/api/auth` origin check IF runtime testing shows the vanity signing
  flow POSTs there (expected: it does not).
- Data/retention decision for existing `documenso_compliance_db` docs (keep old instance read-only for
  archives vs migrate) — ops, not code.
- Docs: `docs/custom-signing-domain.md` (how to configure, DNS/proxy, limitations).
- If pitching upstream: open an issue referencing #1059, propose the opt-in self-host design + CLA.
- **Approval gate → STOP.**

---

## Open decisions to confirm before Phase 1
1. Grain: put `customSigningDomain` on the **Organisation** (recommended; matches EmailDomain grain,
   and MSP vs Compliance are naturally two organisations) vs Team. → default: Organisation.
2. Field format: store full origin `https://sign.aspendoracompliance.com` (recommended) vs bare host.
