# Employee Management + Consent Management

Full-stack HRMS Employee Management module with a six-stage futuristic onboarding UI and a regulation-aware consent engine.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Validation: Zod
- Auth: JWT + bcrypt
- Persistence: PostgreSQL transactions
- File uploads: local development storage, replaceable by S3-compatible object storage

## Six UI stages

1. Identity & Contact
2. Employment & Organization
3. Statutory & Payroll
4. Family & Background
5. Qualifications & Documents
6. Access, Consent & Review

The API persists the normalized entities described by the employee data model and treats consent as a separate, versioned processing record rather than a blanket checkbox.

## Important implementation note

The regulation catalog is configurable seed data. It is not a legal guarantee of compliance. Jurisdiction, sector, collective-bargaining, employment, tax and statutory obligations should be reviewed by qualified counsel before production use.

## Quick start

### 1. Database

Create a PostgreSQL database and run:

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
```

### 2. API

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

### 3. Web

```bash
cd apps/web
cp .env.example .env
npm install
npm run dev
```

Default API: `http://localhost:4000`
Default web: `http://localhost:5173`

## API endpoints

### Employees

- `POST /api/employees`
- `GET /api/employees/:id`
- `PATCH /api/employees/:id`
- `DELETE /api/employees/:id`
- `GET /api/employees/:id/readiness`
- `GET /api/employees/:id/audit`

### Consents

- `GET /api/consents/catalog`
- `GET /api/employees/:id/consents`
- `POST /api/employees/:id/consents/:consentId/grant`
- `POST /api/employees/:id/consents/:consentId/acknowledge`
- `POST /api/employees/:id/consents/:consentId/deny`
- `POST /api/employees/:id/consents/:consentId/withdraw`
- `POST /api/employees/:id/consents/:consentId/renew`

### Documents

- `POST /api/employees/:id/documents`
- `GET /api/employees/:id/documents`

### Metadata

- `GET /api/lookups`
- `GET /api/regulations`

## Security baseline

- Passwords are never stored in plaintext.
- JWTs should be short lived in production.
- Sensitive fields should be encrypted at the application/KMS layer in production.
- Documents should be stored in a private object store in production.
- `consent_audit_log` is append-only by application policy and has a SHA-256 hash chain.
- The API derives derived statutory fields where rules are configured.
- Avoid logging Aadhaar, PAN, bank account numbers or other sensitive personal data.
