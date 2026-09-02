# PD_HRMS — Deployment Checklist
Based on the CMA deployment process. Server: https://app.hrms.protecciodata.co.in

## Architecture
| Component | Tech | Container | Port |
|-----------|------|-----------|------|
| Frontend  | React + Vite (nginx) | hrms-frontend | 1007 -> 80 |
| API       | Node/Express + Prisma | hrms-api | 1004 -> 4000 |
| Database  | PostgreSQL 16 | hrms-postgres | internal only |
| Files     | MinIO | hrms-minio | 1005/1006 |
| HTTPS     | System nginx + certbot | (host) | 80/443 |

## Before every deploy
- [ ] All changes committed & pushed; git status clean on Windows AND server
- [ ] Verified locally on Windows (npm run dev, no console errors)
- [ ] New env vars added to BOTH backend/.env (server) and .env.example (repo)
- [ ] New Prisma migrations tested locally first (npx prisma migrate dev)
- [ ] Import paths match EXACT filename case (Windows is case-insensitive,
      Linux is NOT — this broke the build before!)

## Deploy (on server)
1. cd /home/deploy/PD_HRMS
2. ./deploy.sh
3. Confirm "DEPLOY SUCCESS" and health JSON shows "db":"up"
4. Open https://app.hrms.protecciodata.co.in — login and click through pages
5. If something fails: docker compose logs -f api (or frontend)

## First-time setup (new server) — full runbook
1. Install Docker + Docker Compose
2. git clone https://github.com/Proteccio-Data/PD_HRMS.git /home/deploy/PD_HRMS
3. Create backend/.env from backend/.env.example (fill real secrets)
4. docker compose up -d db   (wait for healthy)
5. docker compose up -d --build api   (runs migrate deploy + seed automatically)
6. cd frontend && npm ci && npm run build && cd ..
7. docker compose up -d frontend
8. System nginx site: /etc/nginx/sites-available/hrms -> proxy to 127.0.0.1:1007
9. sudo certbot --nginx -d app.hrms.protecciodata.co.in
10. Set CORS_ORIGINS in backend/.env, restart api
11. Open firewall: 80, 443 (required); 1004-1007 optional direct access

## Gotchas we learned the hard way
- This terminal STRIPS dollar signs from pasted text. Never paste config
  containing dollar signs; use printf with \044 escapes or heredocs, then
  grep-verify the file afterwards.
- deploy.sh must start with: cd /home/deploy/PD_HRMS  (hard-coded path)
- docker compose restart does NOT reload mounted config files — use
  docker compose up -d --force-recreate <service>
- The HOST nginx owns ports 80/443 and serves OTHER company apps on this
  server (datacounsel, dpdpa, proteccio, etc.) — NEVER stop or disable it.
  Add new sites under /etc/nginx/sites-enabled/ instead.
- API start command is: node dist/index.js  (NOT dist/src/index.js)
- After editing docker-compose.yml ALWAYS run: docker compose config --quiet

## Rollback
git log --oneline -5        # find last good commit
git checkout <commit>
./deploy.sh --skip-pull
git checkout main           # return when ready

## Secrets & security
- Demo password (Password@123) must never reach real users — rotate first
- Secrets live ONLY in backend/.env on the server — never committed to git
- Certbot renews automatically; verify: sudo certbot renew --dry-run
