# WING-003: Connect Production Deployment Target

## Problem
The `deploy-prod.yml` workflow has a placeholder step. Need to wire it to an actual hosting provider.

## Relevant Files
- `.github/workflows/deploy-prod.yml` — deployment workflow
- `server/index.js` — server entry point (what gets deployed)
- `Dockerfile` or `Procfile` — may need to create

## Acceptance Criteria
- [ ] Choose a deployment platform (Railway, Render, or Fly.io)
- [ ] Configure deployment secrets in GitHub
- [ ] `deploy-prod.yml` performs actual deployment on merge to prod
- [ ] Health check confirms deployment success

## Related Code Paths
- `server/index.js` — PORT binding, graceful shutdown
- Environment variables needed: DATABASE_URL, REDIS_URL, JWT_SECRET, TOGETHER_API_KEY, COMPOSIO_API_KEY, MESSAGING_PROVIDER
