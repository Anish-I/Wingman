# WING-001: Fix Composio App Connections

## Problem
`getConnectionStatus()` in `server/services/composio.js` returns `{connected:[], missing:[]}` even for valid users who have connected apps. The function fetches from the Composio REST API but may be hitting issues with:
- Entity ID mismatch (user_uuid vs entityId)
- API response format changes
- Missing error propagation (catch block silently returns empty arrays)

## Relevant Files
- `server/services/composio.js` — `getConnectionStatus()` function (line ~197)
- `server/routes/connect.js` — connection management routes
- `tests/agent6-composio-full.js` — Composio test suite

## Acceptance Criteria
- [ ] `getConnectionStatus()` returns accurate connected/missing arrays
- [ ] Errors from the Composio API are logged with details (status code, response body)
- [ ] If API key is missing, return a clear error instead of empty arrays
- [ ] Add debug logging for the API response to aid troubleshooting

## Related Code Paths
- `getConnectionLink()` uses `client.getEntity()` — confirm entityId format matches
- The REST API call uses `user_uuid` param — verify this maps to our userId correctly
