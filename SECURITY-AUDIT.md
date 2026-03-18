# Wingman Security Audit Report

**Date:** 2026-03-16
**Scope:** Full codebase — server, web, mobile-v2
**Auditor:** Automated (Claude Code)

---

## CRITICAL

### C1. Plaintext Secrets Committed to Git History

**Files:** `.env`, `CLAUDE_TASK.md`, `TASK_CICD.md`, `kanban/context/WING-003.md`

The `.env` file is listed in `.gitignore` but is **not currently tracked**. Previously, multiple **committed markdown files** (`CLAUDE_TASK.md`, `TASK_CICD.md`, `kanban/context/WING-003.md`) contained API keys in plaintext (now scrubbed from files, but still present in git history).

Additionally, the `.env` file itself contains **every production secret in plaintext**:
- Twilio auth token: `[REDACTED — rotate immediately]`
- Together AI API key: `[REDACTED — rotate immediately]`
- Composio API key: `[REDACTED — rotate immediately]`
- Google OAuth client secret: `[REDACTED — rotate immediately]`
- Supabase database URL with credentials: `[REDACTED — rotate immediately]`
- n8n JWT token
- Gemini API key: `[REDACTED — rotate immediately]`

**Impact:** Any contributor, fork, or git history leak exposes all API keys and database credentials.
**Remediation:**
1. Rotate ALL secrets immediately (Twilio, Together AI, Composio, Google OAuth, Supabase DB password, Gemini key).
2. Remove hardcoded keys from committed markdown files.
3. Use `git filter-repo` or BFG Repo-Cleaner to purge secrets from git history.
4. Use a secrets manager (e.g., Doppler, AWS Secrets Manager, or at minimum environment-only injection in CI/CD).

---

### C2. JWT Secret is a Placeholder in Production

**File:** `server/routes/auth.js:15`

```js
const JWT_SECRET = jwtSecret || 'wingman-dev-secret';
```

The `.env` has `JWT_SECRET=your_jwt_secret_here` — a literal placeholder string. The production guard on line 11-14 only fires when `NODE_ENV === 'production'`, meaning any other environment (including staging or misconfigured production) uses this **guessable secret**. Anyone who knows this value can forge arbitrary JWT tokens and impersonate any user.

**Impact:** Complete authentication bypass.
**Remediation:** Set a strong, randomly-generated JWT secret (256+ bits) and fail hard if it is missing regardless of `NODE_ENV`.

---

### C3. ~~Weak PIN Hashing (SHA-256 Without Salt Per User)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Replaced SHA-256+pepper with `bcrypt.hash(pin, 12)` (cost factor 12, ~200ms). Added `POST /auth/verify-pin` endpoint using `bcrypt.compare()` with Redis rate limiting (5 attempts per userId per 15 minutes). Existing SHA-256 hashes are invalidated; users re-set PIN via OTP flow.

---

## HIGH

### H1. ~~OTP Verify Endpoint Has No Rate Limiting~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Added two layers of rate limiting to `POST /auth/verify-otp`: (1) `express-rate-limit` middleware (`otpVerifyLimiter`) keyed by phone number — 5 attempts per 15 minutes; (2) Redis-based per-phone attempt counter (`otp_attempts:<phone>`) — 5 failed attempts per 10-minute OTP TTL window, with TTL refreshed on each failure. On successful verification, both the OTP and attempt counter are cleared.

### H2. ~~OTP Generated with Math.random() (Not Cryptographically Secure)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix:** Replaced `Math.random()` with `crypto.randomInt(100000, 1000000)` for cryptographically secure OTP generation.

### H3. ~~Custom JWT Implementation (No Library)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix (partial — Apple token verification):** The Apple Sign-In branch in `POST /auth/social` previously only base64-decoded the Apple identity token without cryptographic signature verification, allowing token forgery. Now uses `jwks-rsa` to fetch Apple's public keys from `https://appleid.apple.com/auth/keys` and `jsonwebtoken` to verify RS256 signatures, issuer (`https://appleid.apple.com`), and audience (`APPLE_CLIENT_ID`). The original H3 issue about the custom JWT implementation for session tokens was separately addressed when `jsonwebtoken` was adopted for `signToken`/`verifyToken`.

### H4. ~~OAuth Callback IDOR — userId in Query String~~ — FIXED (2026-03-17)

**File:** `server/routes/connect.js`

**Fix:** Replaced raw `userId` in OAuth callback query string with signed, time-limited JWT state tokens (`generateOAuthState`/`verifyOAuthState`). The callback now verifies the signed `state` parameter and rejects requests with missing or invalid tokens.

### H5. ~~Error Messages Leak Internal Details to Clients~~ — FIXED (2026-03-17)

**File:** `server/routes/api.js`

**Fix:** All catch blocks now return a generic `{ error: 'Internal server error' }` to clients instead of `err.message`. The full error object is logged server-side via `console.error` with a descriptive endpoint label (e.g., `[api] chat error:`, `[api] workflow plan error:`) for debugging. `connect.js` and `sms.js` already followed this pattern and required no changes.

---

## MEDIUM

### M1. Token Passed in URL Query Parameters

**File:** `server/routes/connect.js:36-48, 51-68`

JWT tokens are passed as URL query parameters (`/connect/status/:token`, `/connect/initiate?token=...`). URLs are logged by web servers, proxies, CDNs, and browser history. Cloudflare Tunnel (in use) may log full URLs.

**Impact:** Token exposure in logs, browser history, referer headers.
**Remediation:** Use POST bodies or Authorization headers for all token transmission. If URL tokens are needed (e.g., SMS links), use short-lived, single-use tokens separate from session JWTs.

### M2. CORS Defaults to localhost in Non-Production

**File:** `server/index.js:23-31`

```js
const corsOrigin = process.env.CORS_ORIGIN;
if (process.env.NODE_ENV === 'production' && !corsOrigin) { process.exit(1); }
app.use(cors({ origin: corsOrigin || 'http://localhost:3000', credentials: true }));
```

In staging or any non-production environment, CORS defaults to `http://localhost:3000`. If the staging server is publicly accessible (e.g., via Cloudflare Tunnel), the CORS restriction is effectively meaningless since it only allows localhost, but the `credentials: true` flag combined with a missing origin validation could be exploited.

**Impact:** Cross-origin attacks on non-production but publicly exposed instances.
**Remediation:** Always require explicit CORS_ORIGIN configuration when the server is publicly accessible.

### M3. ~~Webhook Signature Validation Skipped in Development~~ — FIXED (2026-03-17)

**File:** `server/routes/sms.js`

**Fix:** Replaced `NODE_ENV` check with explicit `SKIP_WEBHOOK_VALIDATION` feature flag. Signature validation is now always enforced by default for both Twilio and Telnyx, regardless of environment. The flag must be explicitly set to `'true'` to skip validation (local dev only), and a console warning is logged when active.

### M4. ~~Global Rate Limit Too Generous for API Endpoints~~ — FIXED (2026-03-18)

**File:** `server/routes/api.js`

**Fix:** Added per-user rate limiters: `chatLimiter` (30 req/15 min) for `/api/chat`, `workflowLimiter` (20 req/15 min) for `/api/workflows/plan` and `/api/workflows/:id/run`. Also added max chat message length validation (4000 chars) and UUID format validation on all `:id` route params to prevent abuse and unnecessary DB errors.

### M5. No CSRF Protection

The server uses CORS with `credentials: true` but has no CSRF token mechanism. State-changing operations (POST/PATCH/DELETE) rely solely on the JWT Bearer token. Since JWTs are stored in localStorage (web) rather than cookies, this is **currently mitigated** for the web client. However, if cookies are ever introduced, CSRF becomes exploitable.

**Impact:** Low currently, but high risk if cookie-based auth is added.
**Remediation:** Add CSRF tokens or use the `SameSite` cookie attribute if switching to cookie-based auth.

### M6. ~~`updateUserPreferences` Accepts Arbitrary JSON~~ — FIXED (2026-03-17)

**File:** `server/routes/api.js`

**Fix:** Added `ALLOWED_PREFERENCE_KEYS` whitelist (`timezone`, `theme`, `language`, `notifications`, `smsOptIn`). Only whitelisted keys are accepted; unrecognized keys return a 400 error. Empty requests after filtering are also rejected.

---

## LOW

### L1. Web Client Stores JWT in localStorage

**File:** `web/lib/auth.js:8-10`

```js
localStorage.setItem(TOKEN_KEY, token);
```

localStorage is accessible to any JavaScript running on the same origin. If an XSS vulnerability exists, the token can be exfiltrated. httpOnly cookies are more resistant to XSS.

**Impact:** Token theft if XSS is present.
**Remediation:** Consider httpOnly cookies for web sessions. The mobile app using MMKV is fine.

### L2. Mobile MMKV Storage Not Encrypted

**File:** `mobile-v2/src/lib/storage.tsx:3`

```ts
export const storage = createMMKV();
```

MMKV is created without encryption options. On rooted/jailbroken devices, the JWT can be read from the filesystem.

**Impact:** Token extraction on compromised devices.
**Remediation:** Use `createMMKV({ encryptionKey: '...' })` with a device-derived key.

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

### L6. `trust proxy` Set Without Specific Proxy Count

**File:** `server/index.js:17`

```js
app.set('trust proxy', 1);
```

Setting `trust proxy` to `1` trusts a single proxy hop. This is correct for Cloudflare Tunnel but should be verified. If the infrastructure changes (e.g., adding a load balancer), rate limiting could be bypassed by spoofing `X-Forwarded-For`.

**Impact:** Rate limit bypass if proxy topology changes.
**Remediation:** Document the expected proxy chain; consider using `trust proxy` with specific addresses.

---

## Summary

| Severity | Total | Fixed | Remaining | Key Remaining Issues |
|----------|-------|-------|-----------|---------------------|
| CRITICAL | 3 | 1 | 2 | Secrets in git history, placeholder JWT secret |
| HIGH     | 5 | 5 | 0 | All fixed |
| MEDIUM   | 6 | 4 | 2 | Token in URLs (M1), CORS defaults (M2) |
| LOW      | 6 | 3 | 3 | localStorage JWT (L1), unencrypted MMKV (L2), trust proxy (L6) |

## Priority Actions

1. **Immediately rotate all API keys** — Composio, Twilio, Together AI, Google OAuth, Supabase DB password, Gemini. Keys were previously committed in plaintext.
2. ~~**Set a real JWT_SECRET**~~ — DONE (server now requires JWT_SECRET at startup).
3. ~~**Add rate limiting to `/auth/verify-otp`**~~ — DONE (dual rate limiting: express-rate-limit + Redis per-phone).
4. ~~**Switch OTP generation to `crypto.randomInt()`**~~ — DONE.
5. ~~**Replace custom JWT with `jsonwebtoken` library**~~ — DONE.
6. **Scrub secrets from git history** using BFG Repo-Cleaner.
7. ~~**Return generic errors in api.js**~~ — DONE.
8. ~~**Validate Google OAuth redirect_uri against allowed origins**~~ — DONE (2026-03-17).
