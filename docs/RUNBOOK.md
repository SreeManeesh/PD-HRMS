# Proteccio Enterprise HRMS — Production Operations Runbook

This operational runbook provides step-by-step procedures for operating, scaling, securing, and recovering the Proteccio HRMS platform in production environments.

---

## 1. System Architecture & Topology

| Component | Technology | Default Port | Internal / External | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | `5173` / `80` (Nginx) | External | SPA application with role-based routing and payslip builder |
| **Backend API** | Node.js + Express + TypeScript | `4000` / `4001` | Internal (behind reverse proxy) | REST API, RBAC, Payroll & Attendance calculations |
| **Database** | PostgreSQL 16 | `5433` (Host) / `5432` (Docker) | Private / VPC only | Primary transactional store with Prisma ORM |
| **Object Storage** | MinIO / S3 Compatible | `9000` (API) / `9001` (Console) | Internal | Encrypted document, avatar, and logo storage |

---

## 2. Disaster Recovery & Database Backup Procedures

### 2.1 Automated Nightly Backup
Create an automated snapshot script at `/opt/scripts/backup-db.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/hrms"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/hrms_db_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Run pg_dump against the container or host
docker exec -t hrms_postgres pg_dump -U hrms_admin -d hrms_db | gzip > "$FILENAME"

# Retain backups for 30 days
find "$BACKUP_DIR" -type f -name "hrms_db_*.sql.gz" -mtime +30 -delete

echo "[$(date)] Backup completed: $FILENAME"
```

Add to system cron (`crontab -e`):
```cron
0 2 * * * /opt/scripts/backup-db.sh >> /var/log/hrms_backup.log 2>&1
```

### 2.2 Point-In-Time Disaster Recovery (Restoration)
In the event of database corruption or hardware failure:

1. Stop application traffic to prevent partial state writes:
   ```bash
   docker stop hrms_api || systemctl stop hrms-backend
   ```
2. Verify target database is available:
   ```bash
   docker exec -it hrms_postgres pg_isready -U hrms_admin
   ```
3. Drop and recreate database:
   ```bash
   docker exec -it hrms_postgres psql -U hrms_admin -c "DROP DATABASE IF EXISTS hrms_db;"
   docker exec -it hrms_postgres psql -U hrms_admin -c "CREATE DATABASE hrms_db OWNER hrms_admin;"
   ```
4. Restore from the most recent verified `.sql.gz` snapshot:
   ```bash
   gunzip -c /var/backups/hrms/hrms_db_YYYYMMDD_HHMMSS.sql.gz | docker exec -i hrms_postgres psql -U hrms_admin -d hrms_db
   ```
5. Apply any pending migrations:
   ```bash
   cd /home/deploy/PD_HRMS/backend
   npx prisma migrate deploy
   ```
6. Restart backend service and verify health endpoint:
   ```bash
   docker start hrms_api || systemctl start hrms-backend
   curl -s http://localhost:4000/api/health | jq .
   ```

---

## 3. Secret & Credential Rotation Runbook

### 3.1 JWT Signing Secret Rotation
Rotate JWT secrets every 90 days or immediately upon suspected compromise:

1. Generate new 64-character high-entropy secret keys:
   ```bash
   openssl rand -hex 64
   ```
2. Update `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in production `.env`.
3. Restart API process:
   ```bash
   pm2 restart hrms-backend --update-env
   ```
4. Invalidate all existing sessions in PostgreSQL:
   ```sql
   UPDATE refresh_tokens SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
   *Result:* All active users are safely required to re-authenticate at next token expiry.

### 3.2 Database Password Rotation
1. Update database user password in PostgreSQL:
   ```sql
   ALTER USER hrms_admin WITH PASSWORD 'NewUltraSecurePassword2026!';
   ```
2. Update `DATABASE_URL` in `backend/.env`.
3. Restart backend services.
4. Verify database connectivity via `curl -f http://localhost:4000/api/health`.

---

## 4. Connection Pool & Performance Tuning

### 4.1 Prisma Connection Pool Resiliency
Under heavy concurrent load (such as 9:00 AM punch-in rush or monthly payroll disbursement runs), PostgreSQL connection exhaustion can cause latency spikes.

Proteccio HRMS automatically enforces connection pooling parameters via `DATABASE_URL` query parameters:
```env
DATABASE_URL="postgresql://hrms_admin:password@localhost:5433/hrms_db?schema=public&connection_limit=25&pool_timeout=30"
```
- `connection_limit`: Maximum number of connections per Node.js worker process (Default: `25`).
- `pool_timeout`: Seconds to wait before timing out connection requests (Default: `30s`).

*Formula for Sizing:*  
`max_connections in postgresql.conf >= (number_of_api_instances * connection_limit) + 15 reserved connections`

---

## 5. Docker Container Orchestration & Horizontal Scaling

### 5.1 Multi-Instance API Behind Nginx
To horizontally scale the backend API to handle 10,000+ employees:

1. Run multiple container replicas or PM2 cluster mode:
   ```bash
   # PM2 Cluster mode:
   pm2 start dist/src/index.js -i max --name hrms-api
   ```
2. Configure Nginx upstream load balancer:
   ```nginx
   upstream hrms_api_cluster {
     least_conn;
     server 127.0.0.1:4000 max_fails=3 fail_timeout=10s;
     server 127.0.0.1:4001 max_fails=3 fail_timeout=10s;
     server 127.0.0.1:4002 max_fails=3 fail_timeout=10s;
     keepalive 32;
   }

   server {
     listen 80;
     server_name hrms.proteccio.internal;

     location /api/ {
       proxy_pass http://hrms_api_cluster;
       proxy_http_version 1.1;
       proxy_set_header Connection "";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }

     location / {
       root /var/www/hrms-frontend;
       try_files $uri $uri/ /index.html;
     }
   }
   ```

---

## 6. Incident Response & Troubleshooting Playbook

### 6.1 Service Health Check Fails (`/api/health` status != "ok")
1. Check process status:
   ```bash
   pm2 status || docker ps
   ```
2. Check database connectivity:
   ```bash
   docker exec -it hrms_postgres psql -U hrms_admin -d hrms_db -c "SELECT 1;"
   ```
3. Inspect recent error logs:
   ```bash
   pm2 logs hrms-backend --lines 50
   ```

### 6.2 Brute Force Lockout Unlock
If a client administrator accidentally locks their account:
1. Check lock status via `GET /api/auth/me` or database:
   ```sql
   SELECT id, email, is_active FROM users WHERE email = 'admin@proteccio.internal';
   ```
2. Reset lockout in Redis/memory or update password via script:
   ```bash
   node -e "require('./dist/src/modules/auth/auth.service').getFailedLoginState()"
   ```

### 6.3 Interactive API Documentation
Production OpenAPI 3.0 documentation is accessible at:
- **Swagger UI Console:** `http://localhost:4000/api/docs`
- **Raw OpenAPI JSON Spec:** `http://localhost:4000/api/docs/spec.json`
