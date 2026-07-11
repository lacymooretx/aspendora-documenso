# Per-Organisation Custom Signing Domain

**What it does:** lets a single Documenso instance emit signer-facing links on a per-organisation
vanity domain. This is what allows the separate **MSP** (`sign.aspendora.com`) and **Compliance**
(`sign.aspendoracompliance.com`) deployments to run as **one instance with two organisations**
instead of two full instances.

Added in the fork (branch `feat/per-org-custom-signing-domain`). Upstream considers custom domains
out of scope (issue #1059 → "self-host"), so this lives in our fork.

---

## How it works

Each organisation has a `customSigningDomain` setting. When set, the signer-facing links that
Documenso puts in **emails** for that organisation's documents are built on the custom domain instead
of the global `NEXT_PUBLIC_WEBAPP_URL`:

- the signing page — `https://<domain>/sign/:token`
- the report page — `https://<domain>/report/:token`
- the completion download — `https://<domain>/sign/:token/complete`

Everything else deliberately stays on the canonical `NEXT_PUBLIC_WEBAPP_URL`: staff dashboard/owner
links (`/t/...`), email logo/asset images, auth callbacks, and the QR code baked into the sealed
certificate PDF.

The signing pages themselves are **token-authenticated and anonymous**, and resolve their branding
from the document's organisation (not from the hostname). So a vanity domain is just a second CNAME
pointed at the same instance — **any token works on any host**, branded correctly. No host-based
routing is needed.

Resolution lives in `resolveSigningBaseUrl()` (`packages/lib/utils/signing-domain.ts`) and is applied
once at the email choke-point `getEmailContext()`
(`packages/lib/server-only/email/get-email-context.ts`), which returns a `baseUrl` consumed by every
signer-email handler.

---

## Configuring an organisation

**Prerequisites (infra):**
1. Point the vanity domain (e.g. `sign.aspendoracompliance.com`) at the Documenso instance — DNS
   record + reverse-proxy host + TLS cert. (This is already done for the compliance domain.)
2. If you also want mail to come **from** that domain, verify a sender domain for the organisation
   (Settings → Email Domains) and set the organisation's Default Email. This is a separate,
   already-existing Documenso feature (SES BYODKIM) — the signing domain and the sender domain are
   independent knobs.

**Set the signing domain (two ways):**
- **UI:** Organisation → Settings → **Email Preferences** → *Custom signing domain*. Enter
  `sign.aspendoracompliance.com` (bare host or full `https://…`; empty clears it). Save.
- **DB (direct):** set `"OrganisationGlobalSettings"."customSigningDomain"` for the org, e.g.
  ```sql
  UPDATE "OrganisationGlobalSettings" ogs
  SET "customSigningDomain" = 'https://sign.aspendoracompliance.com'
  FROM "Organisation" o
  WHERE o."organisationGlobalSettingsId" = ogs.id
    AND o.name = 'Aspendora Compliance';
  ```

A team may override its organisation's value via `TeamGlobalSettings.customSigningDomain` (null =
inherit). For the MSP/Compliance split you'll use two **organisations**, so the org-level field is all
you need.

---

## Verify

Send a test document from the configured organisation and confirm the "please sign" email's button
links to `https://<custom-domain>/sign/<token>`, and that the link loads (200) and shows the correct
branding. A document from an org **without** a custom domain must still link to
`NEXT_PUBLIC_WEBAPP_URL`.

---

## Limitations (by design in this version)

- **Vanity-host login does not work.** Authenticated flows (staff sign-in, passkeys, OAuth/OIDC
  callbacks, WebAuthn) are pinned to the canonical `NEXT_PUBLIC_WEBAPP_URL` (auth-cookie domain,
  callback URLs, rpID). Staff log in on the canonical host; signers are anonymous, so they're
  unaffected. The one edge case: a document set to require signer **account** login
  (`DocumentAccessAuth.ACCOUNT`) opened on the vanity host will fail — the onboarding consent flow
  does not use that.
- **UI "copy link" buttons** (manual `distributionMethod = NONE` sharing) still show the canonical
  host, not the org's vanity domain. The link still works (any token works on any host); only the
  displayed host differs. Automated email distribution — what the onboarding orchestrator uses — is
  fully covered.
- **Sealed-certificate QR code** points at the canonical host on purpose (it's a permanent artifact;
  host stability matters more than vanity there).

---

## Consolidating the two instances (rollout)

1. On the single instance, create/confirm two organisations: **MSP** and **Compliance**.
2. Give each its branding + verified sender domain (already supported).
3. Set `customSigningDomain` on the Compliance org to `sign.aspendoracompliance.com` (MSP uses the
   canonical `sign.aspendora.com`, so it needs no custom domain).
4. Point both domains' reverse-proxy hosts at the one instance.
5. Route all **new** documents for each pipeline to its organisation (the orchestrator uses that org's
   API token / team).
6. **Historical data:** existing signed documents in the separate `documenso_compliance_db` are
   executed legal agreements. Simplest safe path — keep the old compliance instance running
   **read-only** for archive retrieval; do not migrate/merge databases unless you have a verified
   need and backup. New documents flow through the consolidated instance.

---

## Files changed (reference)

- `packages/prisma/schema.prisma` — `customSigningDomain` on `OrganisationGlobalSettings` +
  `TeamGlobalSettings`; migration `20260711120000_add_custom_signing_domain`.
- `packages/lib/utils/signing-domain.ts` (+ test) — `resolveSigningBaseUrl`.
- `packages/lib/types/custom-signing-domain.ts` — validation (`ZCustomSigningDomainSchema`).
- `packages/lib/server-only/email/get-email-context.ts` — resolves + returns `baseUrl`.
- Signer-email handlers: `send-signing-email`, `resend-document`, `process-signing-reminder`,
  `send-document-completed-emails` — use `baseUrl` for signer links.
- `packages/lib/utils/teams.ts`, `packages/lib/utils/organisations.ts` — default settings include the
  field.
- `packages/trpc/server/organisation-router/update-organisation-settings.*` — accept the field.
- `apps/remix/app/components/forms/organisation-signing-domain-form.tsx` +
  `o.$orgUrl.settings.email.tsx` — admin UI.
