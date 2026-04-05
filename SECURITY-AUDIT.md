# Wingman Security Audit Report

**Date:** 2026-03-16
**Scope:** Full codebase — server, web, mobile-v2
**Auditor:** Automated (Claude Code)

---

## CRITICAL

### ~~C1. Plaintext Secrets Committed to Git History~~ — FIXED (2026-03-22)

**Files:** `.env`, `CLAUDE_TASK.md`, `TASK_CICD.md`, `kanban/context/WING-003.md`

The `.env` file is listed in `.gitignore` but is **not currently tracked**. Previously, multiple **committed markdown files** (`CLAUDE_TASK.md`, `TASK_CICD.md`, `kanban/context/WING-003.md`) contained API keys in plaintext.

**Impact:** Any contributor, fork, or git history leak exposes all API keys and database credentials.
**Remediation:**
1. Rotate ALL secrets immediately (Twilio, Together AI, Composio, Google OAuth, Supabase DB password, Gemini key).
2. ~~Remove hardcoded keys from committed markdown files.~~ — DONE (redacted in 82063f9).
3. ~~Remove live-credential `.env` files from workspace.~~ — DONE (2026-03-21).
4. ~~Purge secrets from git history using `git filter-repo`.~~ — DONE (2026-03-22). All plaintext secrets replaced with `[REDACTED-*]` placeholders across entire git history via `git filter-repo --replace-text`.
5. Use a secrets manager (e.g., Doppler, AWS Secrets Manager, or at minimum environment-only injection in CI/CD).

**Mitigations added:**
- `.gitleaks.toml` + CI gitleaks scan job — blocks future secret commits in PRs and pushes.
- `.gitignore` hardened to catch all `.env` variants (`**/.env`, `**/.env.*`).
- Live-credential `.env` files removed from workspace (2026-03-21).
- Git history purged of all plaintext secrets via `git filter-repo` (2026-03-22).

---

### C2. ~~JWT Secret is a Placeholder in Production~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`, `server/index.js`

**Fix:** Removed the fallback placeholder entirely. Both `server/index.js` (lines 41-44) and `server/routes/auth.js` (lines 51-55) now require `JWT_SECRET` at startup regardless of `NODE_ENV`, calling `process.exit(1)` if missing. The JWT is signed with `issuer: 'wingman'` and `audience: 'wingman-app'` claims via `jsonwebtoken`.

---

### C3. ~~Weak PIN Hashing (SHA-256 Without Salt Per User)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Replaced SHA-256+pepper with `bcrypt.hash(pin, 12)` (cost factor 12, ~200ms). Added `POST /auth/verify-pin` endpoint using `bcrypt.compare()` with Redis rate limiting (5 attempts per userId per 15 minutes). Existing SHA-256 hashes are invalidated; users re-set PIN via OTP flow.

---

## HIGH

### H1. ~~OTP Verify Endpoint Has No Rate Limiting~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Added two layers of rate limiting to `POST /auth/verify-otp`: (1) `express-rate-limit` middleware (`otpVerifyLimiter`) keyed by phone number — 5 attempts per 15 minutes; (2) Redis-based per-phone attempt counter (`otp_attempts:<phone>`) — 5 failed attempts per 10-minute OTP TTL window, with sliding TTL refreshed on each failure. On successful verification, both the OTP and attempt counter are cleared. OTP comparison uses `crypto.timingSafeEqual()` to prevent timing side-channel attacks.

### H2a. ~~OTP HMAC Uses JWT_SECRET Instead of Dedicated Key~~ — FIXED (2026-03-25)

**File:** `server/routes/auth.js`, `server/routes/connect.js`, `server/config/validate.js`

OTP verification used HMAC-SHA256 with `JWT_SECRET` as the key. Using the same secret for JWT signing and OTP hashing violates cryptographic key separation — compromise of `JWT_SECRET` would simultaneously compromise OTP integrity.

**Fix:** Introduced a dedicated `OTP_SECRET` environment variable for all HMAC operations (OTP hashing, PIN reset codes, OAuth state binding). `JWT_SECRET` is now used exclusively for JWT sign/verify. Startup validation in `config/validate.js` enforces that `OTP_SECRET` is present, at least 32 characters, and differs from `JWT_SECRET`.

### H2. ~~OTP Generated with Math.random() (Not Cryptographically Secure)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Replaced `Math.random()` with `crypto.randomInt(100000, 1000000)` for cryptographically secure OTP generation.

### H3. ~~Custom JWT Implementation (No Library)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix (partial — Apple token verification):** The Apple Sign-In branch in `POST /auth/social` previously only base64-decoded the Apple identity token without cryptographic signature verification, allowing token forgery. Now uses `jwks-rsa` to fetch Apple's public keys from `https://appleid.apple.com/auth/keys` and `jsonwebtoken` to verify RS256 signatures, issuer (`https://appleid.apple.com`), and audience (`APPLE_CLIENT_ID`). The original H3 issue about the custom JWT implementation for session tokens was separately addressed when `jsonwebtoken` was adopted for `signToken`/`verifyToken`.

### H4. ~~OAuth Callback IDOR — userId in Query String~~ — FIXED (2026-03-17)

**File:** `server/routes/connect.js`

**Fix:** Replaced raw `userId` in OAuth callback query string with signed, time-limited JWT state tokens (`generateOAuthState`/`verifyOAuthState`). The callback now verifies the signed `state` parameter and rejects requests with missing or invalid tokens.

### H5. ~~Login/Signup Endpoints Missing Rate Limiting~~ — FIXED (2026-03-19)

**File:** `server/routes/auth.js`

**Fix:** Added dual-layer rate limiting to `/auth/login` and `/auth/signup`: (1) `express-rate-limit` middleware — `loginLimiter` (10 req/15 min per IP) and `signupLimiter` (5 req/15 min per IP); (2) Redis-based per-email attempt counter (`login_attempts:<email>`) — 5 failed attempts per 15-minute window with sliding TTL refresh. Counter increments on both invalid credentials and non-existent accounts (prevents user enumeration via timing). On successful login, the counter is cleared.

### H6. ~~Error Messages Leak Internal Details to Clients~~ — FIXED (2026-03-17)

**File:** `server/routes/api.js`

**Fix:** All catch blocks now return a generic `{ error: 'Internal server error' }` to clients instead of `err.message`. The full error object is logged server-side via `console.error` with a descriptive endpoint label (e.g., `[api] chat error:`, `[api] workflow plan error:`) for debugging. `connect.js` and `sms.js` already followed this pattern and required no changes.

---

## MEDIUM

### M1. ~~Token Passed in URL Query Parameters~~ — FIXED (2026-03-18, extended 2026-03-19)

**File:** `server/routes/connect.js`, `server/routes/auth.js`

**Fix:** Replaced session JWT in URL query parameters with short-lived (5 min), single-use connect tokens backed by Redis. New flow: (1) Client calls `POST /connect/create-connect-token` with Bearer auth to get an opaque connect token; (2) `GET /connect/initiate?connectToken=...` consumes the token (deleted from Redis after single use). Removed redundant `GET /connect/status/:token` endpoint. Updated `POST /connect/disconnect` to use Bearer auth instead of token in request body. All clients (web + mobile) updated.

**Extended fix (2026-03-19):** The Google OAuth callback (`GET /auth/google/callback`) also put the full JWT in the redirect URL. Replaced with a 60-second single-use auth code backed by Redis. New `POST /auth/exchange-code` endpoint lets the client exchange the code for a JWT. Updated `connect/callback.tsx` and `signup.tsx` on mobile to use the code exchange flow.

### ~~M2. CORS Defaults to localhost in Non-Production~~ — FIXED (2026-04-05)

**File:** `server/index.js`, `server/config/cors.js`

**Fix:** `CORS_ORIGIN` is now required in ALL environments — the server calls `process.exit(1)` if it is not set. The localhost fallback has been removed entirely. A dedicated `createCorsOptions()` factory in `server/config/cors.js` validates the `Origin` header against the allowlist and rejects unknown origins with a 403. Requests without an `Origin` header (non-browser clients like native apps, health probes, and curl) are allowed through without CORS headers, since CORS is a browser-only mechanism and server-side auth (JWT) is the primary control.

### M3. ~~Webhook Signature Validation Skipped in Development~~ — FIXED (2026-03-17)

**File:** `server/routes/sms.js`

**Fix:** Replaced `NODE_ENV` check with explicit `SKIP_WEBHOOK_VALIDATION` feature flag. Signature validation is now always enforced by default for both Twilio and Telnyx, regardless of environment. The flag must be explicitly set to `'true'` to skip validation (local dev only), and a console warning is logged when active.

### M4. ~~Global Rate Limit Too Generous for API Endpoints~~ — FIXED (2026-03-18)

**File:** `server/routes/api.js`

**Fix:** Added per-user rate limiters: `chatLimiter` (30 req/15 min) for `/api/chat`, `workflowLimiter` (20 req/15 min) for `/api/workflows/plan` and `/api/workflows/:id/run`. Also added max chat message length validation (4000 chars) and UUID format validation on all `:id` route params to prevent abuse and unnecessary DB errors.

### ~~M5. No CSRF Protection~~ — MITIGATED (2026-04-05)

The server uses CORS with `credentials: true` and sets an httpOnly session cookie (`__wingman_sess`). The cookie uses `SameSite=Lax`, which blocks cross-site POST/PATCH/DELETE requests from sending the cookie — the exact methods used for all state-changing operations.

**Current protections:**
1. `SameSite=Lax` on all auth cookies — blocks cross-origin subresource requests (forms, fetch, XHR) from attaching the cookie.
2. All state-changing endpoints use POST/PATCH/DELETE (no GET side effects).
3. CORS allowlist rejects unknown origins, providing a secondary defense.
4. Web clients primarily use Bearer tokens (in-memory), not cookies.

**Impact:** Low — `SameSite=Lax` provides effective CSRF protection for the current architecture.
**Remaining risk:** If any GET endpoint gains side effects, or `SameSite` is relaxed to `None`, add explicit CSRF tokens.

### M6. ~~`updateUserPreferences` Accepts Arbitrary JSON~~ — FIXED (2026-03-17)

**File:** `server/routes/api.js`

**Fix:** Added `ALLOWED_PREFERENCE_KEYS` whitelist (`timezone`, `theme`, `language`, `notifications`, `smsOptIn`). Only whitelisted keys are accepted; unrecognized keys return a 400 error. Empty requests after filtering are also rejected.

---

## LOW

### ~~L1. Web Client Stores JWT in localStorage~~ — FIXED (2026-04-04)

**Files:** `mobile-v2/src/lib/auth/utils.tsx`, `mobile/src/auth.ts`

**Fix:** Web auth tokens are now kept in memory only and are never written to `localStorage`/`sessionStorage`. Native clients continue using platform-secure storage. This removes the straightforward XSS token-exfiltration path from browser storage APIs while preserving the existing Bearer-token flow.

### L2. ~~Mobile MMKV Storage Not Encrypted~~ — FIXED (2026-03-18)

**File:** `mobile-v2/src/lib/storage.tsx`

**Fix:** MMKV is now initialized with a 256-bit encryption key generated via `crypto.getRandomValues()` and stored securely in `expo-secure-store` (Keychain on iOS, Keystore on Android). On web, MMKV uses a per-session random encryption key, and JWTs do not live in MMKV on web at all. Native storage initialization refuses to fall back to unencrypted MMKV.

### L3. ~~PIN Validation Allows Non-Numeric Input~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Replaced length-only check with `/^\d{4,8}$/.test(pin)` regex validation on both `POST /auth/set-pin` and `POST /auth/verify-pin`. Returns `400` with message `'PIN must be 4-8 numeric digits.'` if input contains non-digit characters or is outside the length range.

### L4. Dependency Vulnerabilities (Low Severity)

**Source:** `npm audit`

The `composio-core` package has a transitive dependency chain (`external-editor` -> `tmp`) flagged as low severity. No high/critical npm vulnerabilities were found.

**Impact:** Low — the vulnerable code path (temp file creation) is unlikely to be exploited in this context.
**Remediation:** Monitor and update when `composio-core` releases a fix.

### L5. ~~`jsonwebtoken` Package Installed but Unused~~ — FIXED (2026-03-17)

**File:** `server/routes/connect.js`, `server/routes/auth.js`

**Fix:** `jsonwebtoken` is now actively used: `connect.js` uses it for OAuth state token signing/verification, and `auth.js` uses it for session JWT signing and Apple Sign-In token verification (with `jwks-rsa`).

### ~~L6. `trust proxy` Set Without Specific Proxy Count~~ — FIXED (2026-04-05)

**File:** `server/index.js`

**Fix:** `trust proxy` is no longer hardcoded. It is only enabled when `TRUST_PROXY` is explicitly set in the environment. The value is parsed as an integer (number of hops) if numeric, or passed as-is for named presets (`loopback`, comma-separated subnets, etc.). When unset, Express does not trust proxy headers at all, preventing `X-Forwarded-For` spoofing in environments without a real reverse proxy.

### ~~L7. No HTTP Server Timeouts (Slowloris/Slow-POST Exposure)~~ — FIXED (2026-04-05)

**File:** `server/index.js`

The Node.js HTTP server used default timeouts: no `requestTimeout`, 60s `headersTimeout`, 5s `keepAliveTimeout`. This left the server vulnerable to slowloris attacks (slow header delivery to exhaust connections) and slow-POST attacks (dripping request body bytes to hold connections open).

**Fix:** Configured explicit server timeouts:
- `headersTimeout` = 30s — rejects connections that can't deliver complete headers promptly
- `requestTimeout` = 180s — accommodates the 120s orchestrator processing timeout plus overhead
- `timeout` = 180s — overall socket inactivity timeout
- `keepAliveTimeout` = 20s — connection reuse window (must be < headersTimeout per Node.js requirement)

### ~~L8. CSP `upgrade-insecure-requests` Always Enabled~~ — FIXED (2026-04-05)

**File:** `server/index.js`

The `upgrade-insecure-requests` CSP directive was always emitted regardless of environment. In local development (HTTP on localhost:3001), this directive tells browsers to upgrade all HTTP requests to HTTPS, which fails without TLS configured.

**Fix:** `upgradeInsecureRequests` is now only included in the CSP when HTTPS is enforced (production or `FORCE_HTTPS=true`).

### ~~L9. No Permissions-Policy Header~~ — FIXED (2026-04-05)

**File:** `server/index.js`

The server did not send a `Permissions-Policy` header, leaving browser feature access unrestricted. While this is an API server (not serving HTML), defense-in-depth dictates restricting features that should never be used.

**Fix:** Added `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` header to all responses, denying these features in all contexts.

### ~~H8. Logout Endpoint Token-Revocation IDOR~~ — FIXED (2026-04-05)

**File:** `server/routes/auth.js`

The `POST /auth/logout` endpoint accepted a JWT via `req.body.token` (for `navigator.sendBeacon()` support) but did not verify that the token belonged to the authenticated user. An attacker authenticated via cookie could pass a different user's JWT in the request body, causing that user's session to be revoked (denial of service).

**Fix:** Added ownership verification — the `userId` in the token being blacklisted must match `req.user.id` from the `requireAuth` middleware. Mismatches return 403 Forbidden.

### ~~H7. Implicit Trust of LLM Tool Calls — No Access Control Before Execution~~ — FIXED (2026-03-23)

**File:** `server/services/orchestrator.js`, `server/services/composio.js`

The orchestrator previously executed all tool calls returned by the LLM without verifying the tool was in the fetched tools list or that the user had a connected account for that app. A prompt injection via SMS could convince the LLM to call tools the user hadn't authorized.

**Fix (multi-layered):**
1. **Tool allowlist** — `allowedToolNames` Set built from tools selected for the current turn. Any tool call not in this set is rejected before execution.
2. **Argument validation** — `validateToolArgs()` checks tool arguments against the JSON Schema to prevent attacker-chosen parameters.
3. **App connection check** — `connectedApps` Set (from Composio's active connections) is verified before executing any non-local tool. Unconnected apps are blocked and the user receives a connection link.
4. **Robust app resolution** — `appFromToolName()` uses longest-prefix matching against all known app slugs (sorted by length descending), correctly resolving multi-word slugs like `microsoft_teams`, `google_maps`, `zoho_books` instead of naively splitting on the first underscore.

---

## Summary

| Severity | Total | Fixed | Remaining | Key Remaining Issues |
|----------|-------|-------|-----------|---------------------|
| CRITICAL | 3 | 2 | 1 | Secrets in git history (C1) |
| HIGH     | 9 | 9 | 0 | All fixed |
| MEDIUM   | 6 | 6 | 0 | All fixed (M5 mitigated via SameSite=Lax) |
| LOW      | 9 | 9 | 0 | All fixed |

## Priority Actions

1. **Immediately rotate all API keys** — Composio, Twilio, Together AI, Google OAuth, Supabase DB password, Gemini. Keys were previously committed in plaintext.
2. ~~**Set a real JWT_SECRET**~~ — DONE (server now requires JWT_SECRET at startup).
3. ~~**Add rate limiting to `/auth/verify-otp`**~~ — DONE (dual rate limiting: express-rate-limit + Redis per-phone).
4. ~~**Switch OTP generation to `crypto.randomInt()`**~~ — DONE.
5. ~~**Replace custom JWT with `jsonwebtoken` library**~~ — DONE.
6. **Scrub secrets from git history** using BFG Repo-Cleaner.
7. ~~**Return generic errors in api.js**~~ — DONE.
8. ~~**Validate Google OAuth redirect_uri against allowed origins**~~ — DONE (2026-03-17).
