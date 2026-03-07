# What To Do Next — Step by Step Guide

This guide picks up after the merge of **PR #11** (commit `5659a0a`) and walks you through every step from syncing your local environment to running, testing, and continuing development on the Qiyas platform.

---

## Step 1: Sync Your Local Visual Studio with GitHub

First, make sure your local copy matches what's on GitHub.

### In Visual Studio Terminal (`` Ctrl+` ``):

```bash
# 1. Fetch latest from GitHub
git fetch origin

# 2. Switch to main branch
git checkout main

# 3. Pull the latest changes (including the 5659a0a merge)
git pull origin main

# 4. Verify the merge commit is present
git log --oneline -5
```

You should see:
```
5659a0a Merge pull request #11 from LTZam-Tech/copilot/review-code-for-completeness
```

### If you have uncommitted local changes:
```bash
# Stash your changes first
git stash
git pull origin main
git stash pop    # Re-apply your changes on top
```

---

## Step 2: Install Dependencies

```bash
# Install frontend dependencies (from project root)
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

---

## Step 3: Start the Infrastructure (Database, Redis, MinIO)

You need PostgreSQL, Redis, and MinIO running before the app can start.

### Option A: Using Docker Compose (Recommended)

```bash
cd backend/infra
docker-compose up -d
cd ../..
```

This starts:
- **PostgreSQL 15** on port `5432`
- **Redis 7** on port `6379`
- **MinIO** on ports `9000`/`9001`

### Option B: Using the Bootstrap Script

```bash
# Linux/Mac
cd backend/infra && bash bootstrap.sh && cd ../..

# Windows PowerShell
cd backend\infra; .\bootstrap.ps1; cd ..\..
```

---

## Step 4: Set Up Environment Variables

### Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and verify these values match your local infra:

```ini
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=qiyas_platform
POSTGRES_USER=qiyas_user
POSTGRES_PASSWORD=qiyas_dev_password

REDIS_HOST=localhost
REDIS_PORT=6379

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

JWT_ACCESS_SECRET=dev-access-secret-change-in-prod
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-prod
```

### Frontend

```bash
# From project root
cp .env.example .env
```

Verify `VITE_API_BASE_URL` points to your backend:
```ini
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

## Step 5: Run Database Migrations

Apply the database schema and seed data:

```bash
cd backend

# Run all 6 migration files in order
psql -h localhost -U qiyas_user -d qiyas_platform -f db/migrations/0001_init.sql
psql -h localhost -U qiyas_user -d qiyas_platform -f db/migrations/0002_seed_rbac.sql
psql -h localhost -U qiyas_user -d qiyas_platform -f db/migrations/0003_completion_engine.sql
psql -h localhost -U qiyas_user -d qiyas_platform -f db/migrations/0004_add_auth_columns_and_users.sql
psql -h localhost -U qiyas_user -d qiyas_platform -f db/migrations/0005_full_compliance_controls.sql
psql -h localhost -U qiyas_user -d qiyas_platform -f db/migrations/0006_task_workflow_and_org_structure.sql

cd ..
```

Or if using Docker:
```bash
docker exec -i qiyas-db psql -U qiyas_user -d qiyas_platform < backend/db/migrations/0001_init.sql
# ... repeat for each migration file
```

---

## Step 6: Build and Start the Backend

```bash
cd backend

# Build TypeScript
npm run build

# Start in development mode (with hot reload)
npm run dev
```

The backend starts on **http://localhost:8000**.

### Verify the backend is running:

```bash
curl http://localhost:8000/api/v1/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@university.edu", "password": "AdminPass123"}'
```

You should get a JSON response with an access token.

---

## Step 7: Start the Frontend

Open a **new terminal** (keep the backend running):

```bash
# From project root
npm run dev
```

The frontend starts on **http://localhost:5173**.

### Test Login:

Open your browser to `http://localhost:5173` and log in with:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@university.edu | AdminPass123 |
| Dean | dean@university.edu | DeanPass123 |
| Consultant | consultant@qiyas.sa | ConsultPass123 |
| User | employee@test.com | UserPass123 |

---

## Step 8: Run the Tests

### Backend Tests

```bash
cd backend
npm run test            # Run all tests with coverage
npm run typecheck       # Check TypeScript types
npm run lint            # Check code style
```

### Frontend Tests

```bash
# From project root
npm run test:run        # Run tests once
npm run lint            # Check code style
```

---

## Step 9: Verify PR #11 Fixes Are Working

The merge included critical bug fixes. Test each category:

### 1. RBAC Permissions (were completely broken before)
- Log in as **Admin** → should see all pages
- Log in as **User** → should only see Dashboard, Tasks, Evidence
- Try accessing `/review` as User → should be denied

### 2. Status Flows (were incorrect before)
- Create a task → assign to a user → submit evidence → review it
- Verify the workflow progresses: `assigned` → `in_progress` → `submitted` → `under_review` → `approved`/`rejected`

### 3. Soft Delete (was hard-deleting before)
- Delete a perspective or standard → verify it disappears from the list
- Check the database: `deleted_at` should be set, record should still exist

---

## Step 10: Set Up CI/CD (Recommended Next Step)

The project currently has **no CI/CD pipelines**. Create GitHub Actions:

### Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd backend && npm ci
      - run: cd backend && npm run typecheck
      - run: cd backend && npm run lint
      - run: cd backend && npm run build

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test:run
```

---

## What's Next After Setup — Development Roadmap

### Phase 2 (Current — 40% Complete): Workflow & SLA

These are the highest-priority items to build next:

| Priority | Task | Description |
|----------|------|-------------|
| 🔴 Critical | **SLA Monitoring Cron** | 15-minute job to check task deadlines and trigger escalations |
| 🔴 Critical | **Email Notifications** | Wire up the Bull queue worker to send real emails |
| 🟡 High | **Resubmission Workflow** | Full cycle from rejection → resubmit → re-review |
| 🟡 High | **Dashboard Aggregation** | Refresh materialized views every 15 minutes |
| 🟢 Medium | **Task Comments API** | CRUD endpoints for task discussion threads |
| 🟢 Medium | **Evidence Vault Search** | Search approved evidence by keyword |

### Phase 3 (Planned — 0%): Reporting & Audit

| Task | Description |
|------|-------------|
| Report Engine | Self-Assessment (PDF), Evidence Register (XLSX), Non-Compliance (PDF) |
| Signed URL Downloads | Secure file access via MinIO pre-signed URLs |
| Audit Log Partitioning | Split audit_logs for performance |
| Redis Caching | Cache dashboard queries and frequent lookups |

### Phase 4 (Planned — 0%): Hardening

| Task | Description |
|------|-------------|
| Multi-Factor Auth (TOTP) | Add 2FA to login flow |
| API Rate Limiting | Harden all endpoints |
| Performance Monitoring | New Relic or DataDog integration |
| Advanced Analytics | Charts and trend visualization |

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start infra | `cd backend/infra && docker-compose up -d` |
| Start backend | `cd backend && npm run dev` |
| Start frontend | `npm run dev` |
| Build backend | `cd backend && npm run build` |
| Build frontend | `npm run build` |
| Run backend tests | `cd backend && npm run test` |
| Run frontend tests | `npm run test:run` |
| Full Docker deploy | `docker-compose up --build -d` |
| Check TypeScript | `cd backend && npm run typecheck` |
| Lint all code | `npm run lint && cd backend && npm run lint` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` on port 5432 | PostgreSQL not running → `cd backend/infra && docker-compose up -d` |
| `ECONNREFUSED` on port 6379 | Redis not running → same as above |
| Login returns 401 | Run migrations first (Step 5), then check credentials |
| Frontend can't reach backend | Check `VITE_API_BASE_URL` in `.env` matches backend port |
| TypeScript build errors | Run `cd backend && npm run typecheck` to see specific errors |
| Permission denied on Docker | Use `sudo docker-compose up -d` or add user to docker group |
| `5659a0a` not in git log | Run `git fetch origin && git pull origin main` |
