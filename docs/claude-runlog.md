# Claude Runlog — aspendora-documenso fork

Step-by-step execution log for extending the Documenso fork so a **single instance** can serve
**multiple vanity signing domains** (collapsing the separate MSP + Compliance Documenso instances
into one). Newest entries at the bottom.

---

## 2026-07-11 — Investigation & scoping

**Goal:** Understand why two Documenso instances exist today and decide how to consolidate.

**What I did / found:**
- Fork `main` has **zero code divergence** from `upstream/main` (`git diff upstream/main...HEAD` empty).
  Upstream remote is configured (`documenso/documenso`), push disabled. Our fork = clean mirror.
- The two live instances differ only in deployment config:
  - MSP: `sign.aspendora.com`, DB `documenso_db`, bucket `documenso`, sender ~"Aspendora".
  - Compliance: `sign.aspendoracompliance.com`, DB `documenso_compliance_db`, bucket
    `documenso-compliance`, sender "Aspendora Compliance" (`agreements@aspendora.com`).
    (Source: `~/code/compliance-onboarding/docs/documenso-compliance.docker-compose.yml`,
    `~/code/compliance-onboarding/docs/infrastructure.md`,
    `~/code/msp-onboarding/docs/02-intake-and-consent.md`.)
- Documenso **already** supports, per Organisation/Team: branding (logo/colors/CSS), custom **sender
  identity** via verified `EmailDomain` + `OrganisationEmail` (DKIM), reply-to, and full data
  isolation (envelopes belong to a Team). Confirmed in `packages/prisma/schema.prisma`
  (`OrganisationGlobalSettings` ~956, `TeamGlobalSettings` ~998, `EmailDomain` ~1180,
  `OrganisationEmail` ~1199).
- **The one real gap:** all client-facing URLs are built from a single global
  `NEXT_PUBLIC_WEBAPP_URL()` (`packages/lib/constants/app.ts:7`). No per-org/per-team signing
  **domain**. e.g. `formatSigningLink` = `${WEBAPP_URL}/sign/${token}`
  (`packages/lib/utils/recipients.ts:40`). This is what forces separate instances to get vanity
  signing links.
- App framework: **React Router v7 (Remix) + Hono adapter** (`apps/remix`). Server has request-host
  access → host-based org resolution is feasible.

**Upstream prior art (issue-first check):**
- Issue **#1059 "feat: Custom Domains"** — CLOSED. Maintainer (ElTimuro): *"Currently out of scope /
  For custom domains we recommend self-hosting / May be revisited in the future."*
- Issue **#1244** — closed as duplicate of #1059.
- **Conclusion:** Upstream has explicitly declined custom domains for the hosted product and points
  to self-hosting. An upstream PR is a long shot. We build it in the fork for self-hosting; keep it
  clean + opt-in so it *could* be offered later, but do not compromise our consolidation for it.

**Decisions (from user):**
1. **Must keep vanity domains** — compliance links must stay `sign.aspendoracompliance.com`,
   MSP `sign.aspendora.com`, both from ONE instance → build per-org custom-domain support.
2. **Consolidate first, PR maybe** — priority is our ops; upstream PR is nice-to-have.

**Next required steps:**
- [x] Finish subsystem mapping (4 parallel agents: URL construction, email/sender, auth+host,
      branding+assets).
- [x] Write the design + phased plan into `docs/app-build-progress.md`.
- [ ] Get plan approval, then implement Phase 1.

---

## 2026-07-11 — Subsystem mapping results (4 parallel Explore agents)

**Goal:** Pin the exact code the custom-signing-domain feature touches; find the cleanest injection
point and the constraints.

**Findings (full detail in `docs/app-build-progress.md`):**
- **Sender identity + DKIM already per-org** — no code needed; config only
  (`get-email-context.ts:165-176`, SES BYODKIM at provision).
- **Signing page already vanity-domain safe** — `/sign/:token`,`/d/:token`,embed are
  token-auth/anonymous (`getOptionalSession`); branding host-relative from the token's envelope; CSP
  permits it. **No host→org routing needed** — a vanity domain is just a second CNAME; any token
  works on any host.
- **The only gap:** signer email links use global `NEXT_PUBLIC_WEBAPP_URL()`. Choke-point
  **`getEmailContext`** already has org+settings loaded for every signer email.
- **Auth is custom Hono (not NextAuth)**, everything pinned to `NEXT_PUBLIC_WEBAPP_URL`
  (cookie domain, OAuth callbacks, WebAuthn rpID, one `/api/auth` origin allowlist). Multi-domain
  auth = big/risky, **excluded from v1**; staff use canonical host, signers are anonymous.
- **Assets on signing page already host-relative** (logo, fonts) → work on vanity domain unchanged.

**Design decision:** add `OrganisationGlobalSettings.customSigningDomain`; resolve a `baseUrl` in
`getEmailContext`; rewrite ~7 signer-facing link lines across 4 email handlers. Everything else
(owner `/t/...` links, email asset host, sealed-PDF QR) stays on the canonical host. Three phases
with approval gates (see progress doc).

**Next:** await plan approval → implement Phase 1.

---

## 2026-07-11 — Implementation (Phases 1–3) — user approved "proceed until completion"

**Goal:** Build per-org custom signing domain end-to-end; verify; document.

**What I did:**
- Branch `feat/per-org-custom-signing-domain`.
- **Schema:** added `customSigningDomain String?` to `OrganisationGlobalSettings` +
  `TeamGlobalSettings`; migration `packages/prisma/migrations/20260711120000_add_custom_signing_domain/`.
  Added the field to `generateDefaultTeamSettings` (teams.ts) and
  `generateDefaultOrganisationSettings` (organisations.ts).
- **Resolver:** `packages/lib/utils/signing-domain.ts` `resolveSigningBaseUrl()` (normalises bare host
  → https origin, strips trailing slashes, falls back to `NEXT_PUBLIC_WEBAPP_URL`). Unit test: 7
  cases, all pass.
- **Choke-point:** `getEmailContext` computes `baseUrl` from `settings.customSigningDomain` and returns
  it in all three paths; excluded `baseUrl` from the intermediate `emailContext` type.
- **Handlers:** swapped signer-facing links to `${baseUrl}/…` in `send-signing-email`,
  `resend-document`, `process-signing-reminder`, `send-document-completed-emails`. `assetBaseUrl`,
  owner `/t/...` links, and QR stay canonical. Confirmed `send-pending-email` has no `/sign` link.
- **Admin surface:** `ZCustomSigningDomainSchema` (`packages/lib/types/custom-signing-domain.ts`);
  wired into `update-organisation-settings` types + handler; new
  `organisation-signing-domain-form.tsx` rendered on the org Email settings page.

**Verify:**
- `resolveSigningBaseUrl` unit test — 7/7 pass.
- Full `apps/remix` typecheck (`react-router typegen && tsc`) — clean (fixed 3 expected type errors
  from the new required field).
- `prisma generate` — clean (client + zod + kysely regenerated; get-organisation now returns the
  field). `prisma validate` — schema valid.
- Biome — clean on all changed files (auto-fixed import ordering; no remaining warnings on my code).
- **Not run this session (Docker daemon down):** live DB migrate apply + live email render. Migration
  is a nullable `ADD COLUMN … TEXT` matching Prisma's own generated pattern; apply with
  `prisma migrate deploy` at deploy time.

**Scoping calls:**
- UI copy-link threading deferred (documented limitation) — onboarding uses automated email, which is
  fully covered; copied links still work on any host.
- Multi-domain auth intentionally out of scope — documented.

**Docs:** `docs/custom-signing-domain.md` (config, rollout, limitations).

**Status:** implementation complete + verified (static). Ready to commit on the feature branch.
Upstream PR is the user's call (upstream declared custom domains out of scope).

---

## 2026-07-11 — Production deploy (roll fork onto both instances, keep separate)

**User decisions:** roll fork onto BOTH prod instances (keep separate, no consolidation yet); proceed now.

**Pre-deploy safety checks (read-only, host docker-apps / <internal-ip>):**
- Inventory: `documenso` (MSP, :8119) and `documenso-compliance` (:8128), both on stock
  `documenso/documenso:latest`; shared `postgres:16-alpine`; DBs `documenso_db` +
  `documenso_compliance_db`.
- **Migration-state check (critical):** both prod DBs latest = `20260616120000_add_cancelled_document_status`.
  Our fork adds `20260622120000_add_recipient_reminder_count` (upstream, additive) + our
  `20260711120000_add_custom_signing_domain` (additive). → Deploy is a FORWARD upgrade (not a
  downgrade); both pending migrations are safe `ADD COLUMN` ops. Checksums match (fork mirrors upstream).
- `docker/start.sh` runs `npx prisma migrate deploy` on boot → recreate auto-applies the migrations.

**Plan:** build `aspendora/documenso:<sha>` on host from a `git archive` tarball (no host git creds,
native amd64, matches existing `aspendora/documenso-render:local` pattern) → repoint both compose
image lines → `docker compose up -d` to recreate (auto-migrate on boot) → verify health + signing-link
domain. Build runs while old containers keep serving; only the recreate is a brief interruption.

**Deploy executed + verified (2026-07-11):**
- Built `aspendora/documenso:8c9171ae3` (2.67GB) on host from git-archive of the pushed branch.
- Backed up both DBs → `/opt/backups/documenso-predeploy-20260711-212135/` (documenso_db 460K,
  documenso_compliance_db 242K — metadata only; files live in S3/MinIO).
- Repointed both compose image lines (`documenso/documenso:latest` → `aspendora/documenso:8c9171ae3`);
  originals saved as `docker-compose.yml.pre-fork-bak` in each service dir.
- Recreated compliance then MSP. Each auto-ran `migrate deploy` on boot, applying
  `20260622120000_add_recipient_reminder_count` + `20260711120000_add_custom_signing_domain`.
  "All migrations have been successfully applied." Both health 200.
- Verified: `customSigningDomain` column present in both DBs; public `https://sign.aspendora.com` and
  `https://sign.aspendoracompliance.com` health = 200, root = 302 (login). Cleaned build source.
- **Feature is dormant** (kept instances separate; each already serves its own domain). It activates
  when consolidating — set the compliance org's `customSigningDomain` on a single instance.

**Rollback:** `cd /opt/services/<svc> && cp docker-compose.yml.pre-fork-bak docker-compose.yml &&
docker compose up -d` (stock image ignores the additive columns). DB restore from the predeploy dumps
if ever needed.

**Branch pushed:** `origin/feat/per-org-custom-signing-domain`. **No PR opened** (per user).
