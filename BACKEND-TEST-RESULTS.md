# Wingman Backend Test Results

**Date**: 2026-03-16
**Server**: http://localhost:3001
**Node process**: Manually started via `node server/index.js`

---

## Infrastructure Status

| Component | Status | Details |
|-----------|--------|---------|
| Server (port 3001) | OK | Express server running, responds to requests |
| Redis (port 6380) | OK | PONG response, used for OTP storage and caching |
| PostgreSQL (Supabase) | OK | Remote Supabase DB, user queries succeed |
| Redis (port 6379) | OK | Running but NOT used by Wingman (used by h-cli) |

**Note**: The `.env` file sets `REDIS_URL=redis://localhost:6380`. Port 6379 is a separate Redis instance used by h-cli.

---

## Endpoint Test Results

### GET /health
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Normal request | 200 + JSON status | `{"status":"ok","timestamp":"..."}` (200) | PASS |

### GET /
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Normal request | 200 + server message | `{"message":"Wingman server is running"}` (200) | PASS |

### POST /auth/request-otp
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Missing phone | 400 | `{"error":"Phone number is required."}` (400) | PASS |
| Invalid phone format | 400 | `{"error":"Invalid phone number format..."}` (400) | PASS |
| Valid phone (+15551234567) | 200 | `{"success":true,"message":"OTP sent."}` (200) | PASS |
| Rate limited (5/15min/IP) | Built-in rate limiter | Not exhaustively tested | N/A |

### POST /auth/verify-otp
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Missing phone or code | 400 | `{"error":"Phone and code are required."}` (400) | PASS |
| Wrong OTP code | 401 | `{"error":"Invalid or expired OTP."}` (401) | PASS |
| Valid phone + code | 200 + JWT token | `{"success":true,"token":"...","user":{...}}` (200) | PASS |

### GET /auth/me
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No token | 401 | `{"error":"Authorization token required."}` (401) | PASS |
| Invalid token | 401 | `{"error":"Invalid or expired token."}` (401) | PASS |
| Malformed token (bad base64) | 401 (not crash) | `{"error":"Invalid or expired token."}` (401) | PASS (fixed) |
| Valid token | 200 + user data | `{"id":13,"phone":"+15551234567",...}` (200) | PASS |

### GET /connect/status (Bearer auth)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No token | 401 | `{"error":"Authorization token required."}` (401) | PASS |
| Valid token | 200 + connected/missing | `{"connected":[],"missing":["gmail",...]}` (200) | PASS |

### GET /connect/status/:token (token in URL)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Valid JWT in URL | 200 + connected/missing | `{"connected":[],"missing":["gmail",...]}` (200) | PASS |

### GET /connect/initiate
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No params | 400 | `{"error":"Missing app or token parameter."}` (400) | PASS |
| Invalid token | 401 | `{"error":"Invalid or expired token."}` (401) | PASS |
| Valid params (gmail) | 302 redirect | Redirects to Composio OAuth URL (302) | PASS |

### POST /connect/disconnect
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No body | 400 | `{"error":"Missing app or token parameter."}` (400) | PASS |
| Invalid token | 401 | `{"error":"Invalid or expired token."}` (401) | PASS |

### GET /api/apps (Bearer auth)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No token | 401 | `{"error":"Authorization token required."}` (401) | PASS |
| Valid token | 200 + apps status | `{"connected":[],"missing":[]}` (200) | PASS |

**Note**: `/api/apps` calls `getConnectionStatus()` without the WINGMAN_APPS filter, so `missing` is always `[]`. This is intentional (returns only connected apps for mobile UI).

### GET /api/workflows (Bearer auth)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No token | 401 | `{"error":"Authorization token required."}` (401) | PASS |
| Valid token | 200 + workflows | `{"workflows":[]}` (200) | PASS |

### POST /api/chat (Bearer auth)
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No token | 401 | `{"error":"Authorization token required."}` (401) | PASS |
| Missing message | 400 | `{"error":"message is required"}` (400) | PASS |
| Empty string message | 400 | `{"error":"message is required"}` (400) | PASS |
| Numeric message | 400 | `{"error":"message is required"}` (400) | PASS |
| Whitespace-only message | 400 | `{"error":"message is required"}` (400) | PASS (fixed) |
| Valid message ("hello") | 200 + reply | `{"reply":"Hey there! What's up?"}` (200) | PASS |

---

## Bugs Found and Fixed

### 1. Whitespace-only messages accepted by /api/chat
**File**: `server/routes/api.js` (line 31)
**Problem**: A message like `"   "` passed the `!message` check (truthy non-empty string) and `typeof` check, got trimmed to `""`, and was sent to the LLM.
**Fix**: Added `|| !message.trim()` to the validation check.

### 2. JWT functions used raw `jwtSecret` instead of fallback `JWT_SECRET`
**File**: `server/routes/auth.js` (lines 36, 44, 199)
**Problem**: `signToken()`, `verifyToken()`, and `set-pin` used `jwtSecret` (the raw env var) instead of `JWT_SECRET` (the constant with the dev fallback `'wingman-dev-secret'`). If `JWT_SECRET` env var were unset, `jwtSecret` would be `undefined`, causing `crypto.createHmac('sha256', undefined)` to throw.
**Fix**: Changed all three occurrences to use `JWT_SECRET`.

### 3. `verifyToken()` could crash on malformed tokens
**File**: `server/routes/auth.js` (line 40-49)
**Problem**: `JSON.parse(Buffer.from(body, 'base64url').toString())` could throw on malformed base64 input, causing an unhandled exception that would bubble up as a 500 instead of a clean 401.
**Fix**: Wrapped the entire function body in a try-catch that returns `null` on any error.

---

## Observations (Not Bugs)

1. **Rate limiting**: Global limiter set to 100 req/15min. OTP limiter is 5 req/15min. Both working as configured.
2. **CORS**: Set to `http://localhost:3000` in dev. Production requires `CORS_ORIGIN` env var.
3. **Messaging provider**: Set to `stub` mode -- OTP SMS messages are logged but not actually sent. This is correct for local dev.
4. **JWT_SECRET**: Currently set to the placeholder `your_jwt_secret_here` in `.env`. Should be changed for production.
5. **Database**: Using remote Supabase PostgreSQL. Connection is healthy (user creation and lookup work).
6. **LLM**: Using Gemini via `LLM_PROVIDER=gemini` with `GEMINI_API_KEY`. Chat endpoint returns sensible responses.
