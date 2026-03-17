# Wingman Security Audit Report

**Date:** 2026-03-16
**Scope:** Full codebase — server, web, mobile-v2
**Auditor:** Automated (Claude Code)

---

## CRITICAL

### C1. Plaintext Secrets Committed to Git History

**Files:** `.env`, `CLAUDE_TASK.md`, `TASK_CICD.md`, `kanban/context/WING-003.md`

The `.env` file is listed in `.gitignore` but is **not currently tracked**. However, multiple **committed markdown files** (`CLAUDE_TASK.md`, `TASK_CICD.md`, `kanban/context/WING-003.md`) contain the Composio API key `***REDACTED-COMPOSIO-KEY***` in plaintext. These are tracked by git and will be pushed to the remote.

Additionally, the `.env` file itself contains **every production secret in plaintext**:
- Twilio auth token: `***REDACTED-TWILIO-TOKEN***`
- Together AI API key: `df95ef8f3d39...`
- Composio API key: `***REDACTED-COMPOSIO-KEY***`
- Google OAuth client secret: `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`
- Supabase database URL with credentials: `postgresql://postgres.ojkipnrzkayxooecniye:JTSRMlHnTIogobnO@...`
- n8n JWT token
- Gemini API key: `AIzaSyBP0QCcBnk9QJudNwxjIX-ESQh0_QdKWfU`

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

### H2. OTP Generated with Math.random() (Not Cryptographically Secure)

**File:** `server/routes/auth.js:62`

```js
const otp = Math.floor(100000 + Math.random() * 900000).toString();
```

`Math.random()` is not cryptographically secure. Its output can be predicted if an attacker observes enough values (e.g., via timing attacks or other OTP observations).

**Impact:** OTP prediction enabling account takeover.
**Remediation:** Use `crypto.randomInt(100000, 999999)` (Node.js 14.10+).

### H3. ~~Custom JWT Implementation (No Library)~~ — FIXED (2026-03-17)

**File:** `server/routes/auth.js`

**Fix (partial — Apple token verification):** The Apple Sign-In branch in `POST /auth/social` previously only base64-decoded the Apple identity token without cryptographic signature verification, allowing token forgery. Now uses `jwks-rsa` to fetch Apple's public keys from `https://appleid.apple.com/auth/keys` and `jsonwebtoken` to verify RS256 signatures, issuer (`https://appleid.apple.com`), and audience (`APPLE_CLIENT_ID`). The original H3 issue about the custom JWT implementation for session tokens was separately addressed when `jsonwebtoken` was adopted for `signToken`/`verifyToken`.

### H4. OAuth Callback IDOR — userId in Query String

**File:** `server/routes/connect.js:71-83`

```js
router.get('/callback', async (req, res) => {
  const userId = req.query.userId;
  ...
  if (userId) {
    await invalidateToolsCache(userId);
  }
  res.redirect(`${WEB_URL}/connect/success?app=${appName}`);
});
```

The OAuth callback accepts `userId` directly from the query string with **no authentication**. An attacker can call `/connect/callback?userId=<victimId>&app=gmail` to invalidate any user's tool cache. More critically, the `redirectUrl` passed to Composio on line 61 embeds the userId:

```js
const redirectUrl = `${BASE_URL}/connect/callback?userId=${payload.userId}&app=${app}`;
```

If a CSRF or open redirect exists in the Composio OAuth flow, an attacker could potentially hijack app connections.

**Impact:** Cache invalidation for arbitrary users; potential OAuth flow hijacking.
**Remediation:** Use a signed, time-limited state token in the callback instead of a raw userId.

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

### M3. Webhook Signature Validation Skipped in Development

**File:** `server/routes/sms.js:27-33, 62-69`

```js
if (process.env.NODE_ENV === 'production') {
  const isValid = provider.validateIncoming(req);
  if (!isValid) { return res.status(403).json({ error: 'Forbidden' }); }
}
```

Twilio/Telnyx webhook signature validation only runs in production. Any publicly accessible dev/staging instance accepts forged webhook requests, allowing an attacker to inject arbitrary SMS messages into the system as any phone number.

**Impact:** SMS spoofing, unauthorized message injection, potential account takeover.
**Remediation:** Always validate webhook signatures when a public URL is exposed. Use a feature flag rather than `NODE_ENV`.

### M4. Global Rate Limit Too Generous for API Endpoints

**File:** `server/index.js:38-44`

The global rate limit is 100 requests per 15 minutes per IP. For authenticated API endpoints like `/api/chat`, `/api/workflows`, etc., there are **no per-route rate limits**. An authenticated user (or attacker with a stolen token) can exhaust LLM credits by spamming `/api/chat`.

**Impact:** Denial of service, LLM API cost abuse.
**Remediation:** Add per-user rate limits to expensive endpoints (`/api/chat`, `/api/workflows/plan`, `/api/workflows/:id/run`).

### M5. No CSRF Protection

The server uses CORS with `credentials: true` but has no CSRF token mechanism. State-changing operations (POST/PATCH/DELETE) rely solely on the JWT Bearer token. Since JWTs are stored in localStorage (web) rather than cookies, this is **currently mitigated** for the web client. However, if cookies are ever introduced, CSRF becomes exploitable.

**Impact:** Low currently, but high risk if cookie-based auth is added.
**Remediation:** Add CSRF tokens or use the `SameSite` cookie attribute if switching to cookie-based auth.

### M6. `updateUserPreferences` Accepts Arbitrary JSON

**File:** `server/routes/api.js:119-126`

```js
router.patch('/user/preferences', requireAuth, async (req, res) => {
  const updated = await updateUserPreferences(req.user.id, req.body);
```

The entire `req.body` is merged into the user's JSONB `preferences` column with no schema validation. An attacker could inject arbitrary keys (e.g., `{"role":"admin"}`) that might be consumed by other parts of the system.

**Impact:** Privilege escalation if any code reads preferences for authorization decisions.
**Remediation:** Whitelist allowed preference keys (e.g., `timezone`, `theme`). Validate with a schema (Joi, Zod, etc.).

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

### L5. `jsonwebtoken` Package Installed but Unused

**File:** `server/package.json:19`

The `jsonwebtoken` package (v9.0.2) is a dependency but is never imported. The server uses a custom JWT implementation instead. This is dead weight and confusing.

**Impact:** Wasted dependency; confusing for auditors.
**Remediation:** Either use `jsonwebtoken` (recommended, see H3) or remove it from `package.json`.

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

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 3 | Secrets in git, placeholder JWT secret, weak PIN hashing |
| HIGH     | 5 | No OTP verify rate limit, insecure OTP generation, custom JWT, OAuth callback IDOR, error message leaks |
| MEDIUM   | 6 | Token in URLs, CORS defaults, webhook bypass in dev, rate limit gaps, no CSRF, unvalidated preferences |
| LOW      | 6 | localStorage JWT, unencrypted MMKV, PIN validation, npm audit, unused package, trust proxy |

## Priority Actions

1. **Immediately rotate all API keys** — Composio, Twilio, Together AI, Google OAuth, Supabase DB password, Gemini. The Composio key `***REDACTED-COMPOSIO-KEY***` is in committed files.
2. **Set a real JWT_SECRET** — replace `your_jwt_secret_here` with a 64+ character random string.
3. **Add rate limiting to `/auth/verify-otp`** — this is the most exploitable high-severity issue.
4. **Switch OTP generation to `crypto.randomInt()`**.
5. **Replace custom JWT with `jsonwebtoken` library** (already in package.json).
6. **Scrub secrets from git history** using BFG Repo-Cleaner.
7. **Return generic errors in api.js** instead of `err.message`.
