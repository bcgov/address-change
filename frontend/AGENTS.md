# Frontend (Vite, React, Caddy)

- Run from `frontend/`: `npm ci`, `npm run build`, `npm run lint`, `npm run test:unit`.
- Local dev: `npm run dev` on port 3000.
- E2E: `npx playwright install --with-deps chromium`, then `npx playwright test --project="chromium"`.
- Served by Caddy in deployed environments (`Caddyfile`, `coraza.conf`); keep security headers and WAF settings intact when editing.
- Deployment template: `openshift.deploy.yml`.
