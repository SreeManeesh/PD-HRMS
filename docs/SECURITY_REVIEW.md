# Security Review

**Last Updated:** September 2026

> [!NOTE]
> This document was previously outdated — written when the application had no backend, no auth, and no route guards.
> All critical issues from the original review have been resolved. This document reflects the current security posture.

---

## Summary

The application has a real, production-grade security implementation as of this sprint:

- ✅ **JWT Authentication** — access tokens (15m) + refresh tokens (7d), stored in localStorage (access) / localStorage (refresh). HttpOnly cookie migration is noted as a future hardening step.
- ✅ **Password Hashing** — bcrypt with cost factor 10 via `hashPassword()` / `verifyPassword()`
- ✅ **Route Guards** — `RequireAuth` component wraps all authenticated routes in `AppRouter.jsx`
- ✅ **RBAC** — Permission arrays enforced at the route level and in backend middleware
- ✅ **CSP Headers** — `helmet()` with `contentSecurityPolicy` configured; asset origins read from `APP_URL`/`ASSET_HOST` env vars (not hardcoded)
- ✅ **CORS** — Configured to only allow origins from `CORS_ORIGINS` env var
- ✅ **Rate Limiting** — `express-rate-limit` on all `/api` routes (configurable via env)
- ✅ **Input Validation** — Zod schemas on all API endpoints; Prisma parameterized queries (no raw SQL injection risk)
- ✅ **Audit Logging** — Organization management changes are logged to `organization_audit_logs` table
- ✅ **Structured Logging** — Pino logger throughout backend; no `console.log` in production service code

---

## Current Status of Previously Identified Issues

| # | Issue | Previous Status | Current Status |
|---|-------|-----------------|----------------|
| 1 | Missing Authentication | CRITICAL — Not Started | ✅ **RESOLVED** — Real JWT auth |
| 2 | Missing Route Guards | CRITICAL — Not Started | ✅ **RESOLVED** — RequireAuth wraps all routes |
| 3 | Missing Permission Enforcement | HIGH — Not Started | ✅ **RESOLVED** — RBAC in backend + frontend |
| 4 | JWT in localStorage | MEDIUM — Future Risk | ⚠️ **KNOWN** — Accepted for demo; HttpOnly cookies planned for prod |
| 5 | No Backend Input Validation | MEDIUM — Future Risk | ✅ **RESOLVED** — Zod on all endpoints |
| 6 | SQL Injection Risk | HIGH — Future Risk | ✅ **RESOLVED** — Prisma ORM, no raw SQL |
| 7 | No Password Handling | HIGH — Not Started | ✅ **RESOLVED** — bcrypt cost 10 |
| 8 | No CORS Configuration | MEDIUM — Future Risk | ✅ **RESOLVED** — Configured, origin-restricted |
| 9 | Environment Variable Issues | LOW — Needs Fixing | ✅ **RESOLVED** — Zod validation, `.env.example` documented |
| 10 | No Audit Trail | MEDIUM — Not Started | ✅ **PARTIALLY** — Org audit logs; payroll/employee audit pending |
| 11 | No Rate Limiting | MEDIUM — Future Risk | ✅ **RESOLVED** — `express-rate-limit` on all API |
| 12 | No Security Headers | LOW — Future Risk | ✅ **RESOLVED** — `helmet()` configured |
| 13 | Dependency Vulnerabilities | MEDIUM | ⚠️ **ONGOING** — Run `npm audit` before each release |
| 14 | Error Normalization | PARTIAL | ✅ **RESOLVED** — Both frontend interceptor and backend error handler normalize errors |

---

## Remaining Hardening Items (Pre-Production)

### P1 — Before Production Launch

1. **Secret Scanning CI** — GitHub Actions with TruffleHog/Gitleaks added (`.github/workflows/secret-scan.yml`)
2. **Seed Guard** — `seed.ts` now blocks execution if `NODE_ENV=production` and `ALLOW_SEED≠true`
3. **Uploaded Files in Git** — `backend/uploads/` removed from git tracking; gitignored going forward
4. **HttpOnly Cookie Migration** — Move access token from localStorage to `httpOnly` cookie to eliminate XSS token theft risk. This requires a backend `/auth/refresh` endpoint that sets the cookie.

### P2 — Future Hardening

1. **MFA** — TOTP-based MFA for Admin and HR roles
2. **Session Revocation** — Active refresh token revocation on logout (currently logout is client-side only)
3. **Content Security Policy** — Tighten `script-src` to eliminate `'unsafe-inline'` (requires nonce support)
4. **Subresource Integrity** — Add SRI hashes for any externally loaded resources
5. **Dependency Monitoring** — Enable Dependabot or Snyk for automated vulnerability alerts
