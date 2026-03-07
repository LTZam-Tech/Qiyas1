# Qiyas Platform — Technical Review Report

**Reviewer:** Senior Technical Development Lead  
**Date:** 2026-03-07  
**Scope:** Full codebase audit — backend, frontend, database schema, infrastructure, security

---

## Executive Summary

The platform has a solid structural foundation (PostgreSQL soft-deletes, RBAC permissions table, RFC 7807 error format, audit logs, token rotation, CSRF protection). However, **several critical production-breaking bugs exist**, along with a significant number of security vulnerabilities, data-integrity gaps, and code-quality issues that must be resolved before any production deployment.

Issues are grouped into the following severity levels:
- 🔴 **CRITICAL** — Will cause production failures or data loss
- 🟠 **HIGH** — Security vulnerabilities or significant functionality gaps
- 🟡 **MEDIUM** — Logic errors, business rule violations, or degraded experience
- 🔵 **LOW** — Code quality, standards compliance, maintainability

---

## 1. Database & Schema Issues

### 🔴 CRITICAL-DB-01 — Schema mismatch in `review_decisions.decision` enum

**File:** `backend/src/modules/reviews/reviews.controller.ts:10`  
**File:** `backend/db/migrations/0001_init.sql:281`

The Zod validation schema accepts `'revision_requested'`:
```ts
decision: z.enum(['approved', 'rejected', 'revision_requested'])
```
But the PostgreSQL `CHECK` constraint only allows:
```sql
CHECK (decision IN ('approved','rejected','resubmission_required'))
```
Every `revision_requested` review will **crash with a PostgreSQL constraint violation** at runtime. The value used in `reviews.service.ts:113` is `'revision_requested'` as well. All three layers (validator, service, DB) must be aligned on `'resubmission_required'`.

---

### 🔴 CRITICAL-DB-02 — SLA monitor job has completely wrong column names

**File:** `backend/src/jobs/sla-monitor.ts`

The job will throw at runtime because:

| Line | Wrong | Correct (schema) |
|------|-------|-----------------|
| 19 | `u.full_name` | `u.name` |
| 87 | `u.full_name` | `u.name` |
| 88 | `u.role_id` and `u.status = 'active'` | Roles are in `user_roles` junction table; status column is `u.is_active` |
| 30 | `notifications(task_id, message)` | These columns do not exist in the `notifications` table schema |
| 49 | `notifications(user_id, task_id, type, title, message)` | `task_id` and `message` columns don't exist |
| 25 | `t.status NOT IN ('completed', 'cancelled')` | `'completed'` is not a valid task status; use `'approved'` |
| 75 | `escalation_events(status, reason)` | These columns don't exist in the schema; table only has `resolved_at` |
| 70 | `ee.status = 'open'` | No `status` column on `escalation_events` |

The entire job is dead code that will crash on first execution.

---

### 🔴 CRITICAL-DB-03 — Completion recalculation does not propagate up the hierarchy

**File:** `backend/src/modules/reviews/reviews.service.ts:141`

When a review is approved, `recalc_standard_completion($1)` is called. This updates `standards.completion_pct` correctly. However, **`recalc_axis_completion` and `recalc_perspective_completion` are never called**. As a result, `axes.completion_pct`, `perspectives.completion_pct`, and the global completion shown on the dashboard will be permanently stale after every review approval.

---

### 🔴 CRITICAL-DB-04 — `getTasksByUser` joins on non-existent column `s.name`

**File:** `backend/src/modules/tasks/tasks.service.ts:272`

```sql
LEFT JOIN standards s ON t.standard_id = s.id
-- selects:
s.name as standard_name
```
The `standards` table has `name_ar` and `name_en` columns — there is no `name` column. This query **will fail at runtime** with a "column s.name does not exist" PostgreSQL error for every call to `getTasksByUser`.

---

### 🔴 CRITICAL-DB-05 — `UsersService.getAllUsers` increments `paramIndex` without pushing a param

**File:** `backend/src/modules/users/users.service.ts:69`

```ts
} else if (statusFilter === 'inactive' || statusFilter === 'suspended') {
  query += ` AND u.is_active = FALSE`;
}
paramIndex++; // <-- increments even though nothing was pushed to params[]
```
If the `status` filter is combined with the `role` filter, the role parameter ends up at `$2` in `params` but `$1` in the query string, causing a **parameter mismatch that crashes the query**.

---

### 🔴 CRITICAL-DB-06 — `recalc_standard_completion` sets wrong `completion_status`

**File:** `backend/db/migrations/0003_completion_engine.sql:44`

```sql
completion_status = CASE
  WHEN v_pct = 100 THEN 'completed'
  WHEN v_pct = 0   THEN 'not_started'
  WHEN v_pct < 100 THEN 'partial'   -- 'in_progress' is never set
  ELSE 'in_progress'                -- unreachable branch
END
```
The `'in_progress'` branch is dead code. Every standard with 1–99% completion will be marked `'partial'` instead of `'in_progress'`, which conflicts with the defined domain states.

---

### 🟡 MEDIUM-DB-07 — `dashboard_snapshot_mv` is never automatically refreshed

**File:** `backend/src/modules/dashboard/dashboard.service.ts:224`

The `refreshSnapshot()` method calls `REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_snapshot_mv`, but this method is **never called from any scheduled job, trigger, or post-review hook**. The materialized view will display permanently stale data after initial seeding.

---

### 🟡 MEDIUM-DB-08 — `getOverdueTasks` does not filter soft-deleted records

**File:** `backend/src/modules/tasks/tasks.service.ts:285`

```sql
WHERE t.status NOT IN ('approved', 'closed', 'cancelled') AND t.due_date < NOW()
```
Missing `AND t.deleted_at IS NULL`. Soft-deleted tasks will appear in overdue queries.

---

### 🟡 MEDIUM-DB-09 — `BaseRepository.delete` performs hard (physical) delete

**File:** `backend/src/db/repository.ts:108`

```ts
await db.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
```
All individual service delete methods use soft deletes (`deleted_at = NOW()`). The base `delete()` method does a hard `DELETE`, creating a dangerous inconsistency. Any code that accidentally calls `super.delete()` or `repository.delete()` instead of the service-level soft-delete will **permanently and silently destroy records**.

---

### 🟡 MEDIUM-DB-10 — `BaseRepository.findAll` returns soft-deleted records

**File:** `backend/src/db/repository.ts:66`

```ts
async findAll(_filters: any = {}): Promise<T[]> {
  const result = await db.query(`SELECT * FROM ${this.tableName}`);
```
No `WHERE deleted_at IS NULL` filter. Any code that calls this method will silently return deleted records.

---

### 🔵 LOW-DB-11 — `perspectives` and `standards` create/update stores same value for both `_ar` and `_en` fields

**File:** `backend/src/modules/perspectives/perspectives.service.ts:99`  
**File:** `backend/src/modules/standards/standards.service.ts:87`

```ts
[data.name, data.name, data.code, data.description, data.description, ...]
// => name_ar and name_en both set to the same Arabic/English value
```
The API accepts a single `name` and duplicates it into both `name_ar` and `name_en`. The platform is inherently bilingual — the API must accept separate fields or the client must send both.

---

### 🔵 LOW-DB-12 — Audit logs never capture `before_value` / `after_value`

**File:** `backend/src/db/repository.ts:121`  
**Schema:** `backend/db/migrations/0001_init.sql:344`

The `audit_logs` table has `before_value JSONB` and `after_value JSONB` columns, but the `logAudit` helper only ever stores `metadata`. The audit trail cannot show what data changed, making forensic investigations impossible.

---

## 2. Security Issues

### 🟠 HIGH-SEC-01 — JWT access token stored in `localStorage` (XSS vulnerable)

**File:** `src/lib/authStorage.js`

```js
localStorage.setItem(ACCESS_TOKEN_KEY, token);
```
`localStorage` is accessible to any JavaScript running on the page. A single XSS vulnerability anywhere in the frontend would allow an attacker to steal the access token silently. Industry best practice for SPAs is `httpOnly` cookies (already used for the refresh token) or `sessionStorage` with short expiry.

---

### 🟠 HIGH-SEC-02 — Hardcoded plaintext demo passwords in production frontend code

**File:** `src/context/AuthContext.jsx:31`

```js
const MOCK_USERS = {
  'admin@university.edu': { password: 'AdminPass123', ... },
  'dean@university.edu':  { password: 'DeanPass123',  ... },
  ...
};
```
These plaintext passwords ship in the JavaScript bundle sent to every browser. Even if `VITE_USE_MOCK_API=false`, the passwords are visible in the browser's developer tools under Source maps. This is a **critical credential exposure** for a government compliance system. These must be completely removed from the codebase, not just disabled via a flag.

---

### 🟠 HIGH-SEC-03 — Refresh token accepted from request body (bypasses `httpOnly` protection)

**File:** `backend/src/modules/auth/auth.controller.ts:98,127`

```ts
const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
```
The `httpOnly` cookie protects the refresh token from XSS. Accepting it from the body negates this — any attacker who extracts the token from storage can call `/refresh` via body POST. Only `req.cookies.refreshToken` should be accepted.

---

### 🟠 HIGH-SEC-04 — Email templates vulnerable to HTML injection (stored XSS in emails)

**File:** `backend/src/workers/email-notification.ts:19`

```ts
task_assignment: (data: any) => `
  <p>You have been assigned: <strong>${data.taskTitle}</strong></p>
  <p>Description: ${data.taskDescription}</p>
```
User-controlled data is interpolated directly into HTML strings without any escaping. A task titled `<script>...</script>` or `<img onerror=...>` would inject code into emails rendered by email clients. All dynamic values must be HTML-escaped.

---

### 🟠 HIGH-SEC-05 — Virus scanning config is `true` but no implementation exists

**File:** `backend/src/config/index.ts:165` — `virusScanEnabled: true`  
**File:** `backend/src/modules/submissions/submissions.service.ts` — No antivirus call

The config declares `virusScanEnabled: true` but there is no ClamAV integration, no external scanner API call, and no blocking scan before storing files. Evidence files are accepted, stored in MinIO, and the `virus_scan_status` in `evidence_files` remains permanently `'pending'`. This is a false sense of security.

---

### 🟠 HIGH-SEC-06 — `multer` temp uploads use a relative path

**File:** `backend/src/modules/submissions/submissions.controller.ts:10`

```ts
const upload = multer({ dest: 'uploads/', ... });
```
A relative path depends on the process's current working directory, which varies between environments. If the backend starts from a different directory (as can happen in Docker), files may be written to unexpected locations. Use `path.join(__dirname, '../../uploads')` with an absolute path.

---

### 🟠 HIGH-SEC-07 — No UUID validation on route path parameters

**Files:** All controllers that use `req.params.id`

```ts
const taskId = req.params.id as string; // no validation
```
Passing a non-UUID string (e.g., `../../etc/passwd`, `' OR '1'='1`) to any `:id` route causes a raw PostgreSQL error to bubble up rather than a clean 400. Add a middleware or Zod `.uuid()` check on all `:id` params before service calls.

---

### 🟡 MEDIUM-SEC-08 — Dashboard `limit` query parameter has no upper bound

**File:** `backend/src/modules/dashboard/dashboard.controller.ts:145`

```ts
const limit = parseInt(req.query.limit as string) || 10;
```
An authenticated user can pass `?limit=1000000` and force the database to return massive result sets. Add a cap, e.g. `Math.min(limit, 100)`.

---

### 🟡 MEDIUM-SEC-09 — In-memory `passwordChangeAttempts` Map is lost on restart

**File:** `backend/src/modules/auth/auth.service.ts:18`

```ts
private readonly passwordChangeAttempts = new Map<string, number[]>();
```
This rate-limit state lives in process memory. Every server restart or horizontal scale event resets it. The existing `express-rate-limit` on the route covers the IP level, but user-level throttling via Redis should be used instead.

---

### 🟡 MEDIUM-SEC-10 — Error log data (including user actions) stored in `localStorage`

**File:** `src/services/errorLogger.js:211`

```js
localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
```
Error logs can contain user emails, request URLs, and request payloads. Persisting these to `localStorage` exposes them to any script running on the page (XSS) and to anyone with physical access to the device. Error logs should be sent to a server-side endpoint, not stored client-side.

---

## 3. API / Business Logic Issues

### 🔴 CRITICAL-API-01 — `PUT /tasks/:id` uses `canViewTask` instead of `canEditTask`

**File:** `backend/src/modules/tasks/tasks.controller.ts:69`  
**File:** `backend/src/modules/tasks/tasks.routes.ts:12`

```ts
router.put('/:id', tasksController.updateTask); // no authorize() at route level
// controller:
const canView = await canViewTask(req.user!.id, taskId);
```
The `updateTask` route has **no `authorize()` permission check** at the route level, and the controller only checks `canViewTask`. This means any employee assigned to a task can:
- Set `status = 'approved'`
- Set `status = 'closed'`
- Change the `priority` or `dueDate`

There is no task state-machine enforcement — no workflow check preventing backward transitions.

---

### 🟠 HIGH-API-02 — `GET /submissions` returns all submissions regardless of role

**File:** `backend/src/modules/submissions/submissions.controller.ts:24`

`getAllSubmissions` applies no user-role filtering. An `employee` can call `GET /api/v1/submissions` and receive every evidence submission in the system, including submissions from other departments. The service must filter by `submitted_by = userId` for the employee role.

---

### 🟠 HIGH-API-03 — `GET /reviews` returns all reviews regardless of role

**File:** `backend/src/modules/reviews/reviews.controller.ts:15`

Same issue as API-02. Any authenticated user can see every review decision in the platform. Role-based filtering is missing from the service.

---

### 🟠 HIGH-API-04 — `UsersService.updateUser` ignores `roleId` from the request body

**File:** `backend/src/modules/users/users.service.ts:152`

The `UpdateUserDto` includes `roleId` and `departmentId`, and the Zod schema in the controller validates them. However, `updateUser` in the service **never applies `roleId`** — there is no code to update `user_roles`. The `departmentId` field is also silently ignored. An admin calling `PUT /users/:id` with a new role will receive a success response but the role change is never persisted.

---

### 🟡 MEDIUM-API-05 — No pagination on any list endpoint

**Files:** All GET list routes (`/tasks`, `/users`, `/perspectives`, `/standards`, `/submissions`, `/reviews`)

All list endpoints return every record in the database with no `LIMIT`/`OFFSET` or cursor pagination. In a system with hundreds of users, thousands of tasks, and evidence submissions, this will cause:
- Out-of-memory crashes on the Node.js process
- Full table scans on every request
- Extremely slow page loads

---

### 🟡 MEDIUM-API-06 — `dashboard.controller.ts` hardcodes `partialCompliance` as 30%

**File:** `backend/src/modules/dashboard/dashboard.controller.ts:28`

```ts
partialCompliance: Math.round((overview.standardsCount || 95) * 0.3),
```
This KPI is **fabricated** from a hardcoded 30% multiplier. The correct value must come from the completion engine (counting standards with `completion_status = 'partial'`). Real government compliance data must never be approximated.

---

### 🟡 MEDIUM-API-07 — Report queue `userId` type mismatch

**File:** `backend/src/queue/index.ts:37`  
**File:** `backend/src/modules/reports/reports.routes.ts:23`

The `ReportJob` interface declares `userId: number`, but `req.user!.id` is a UUID string. The job payload will contain a string where a number is expected, causing type errors in the report worker.

---

### 🟡 MEDIUM-API-08 — No job-status endpoint for report generation

**File:** `backend/src/modules/reports/reports.routes.ts`

`POST /reports/generate` returns a `jobId` but there is no `GET /reports/jobs/:jobId` endpoint to check status or retrieve the output file. Clients have no way to know when a report is ready or whether it failed.

---

### 🟡 MEDIUM-API-09 — `GET /submissions` missing `getSubmissions` authorization check

After the middleware applies `authorize('evidence:submit')`, only employees can POST. But the `GET /` route only requires `authenticate` — consultants and employees can both see all submissions (as noted in API-02), but the asymmetry is also a design error: submission submitters (`evidence:submit`) shouldn't necessarily be able to list all submissions.

---

### 🔵 LOW-API-10 — Health endpoint exposes internal service topology

**File:** `backend/src/app.ts:124`

```json
{ "services": { "database": "up", "redis": "up" } }
```
The unauthenticated `/health` endpoint reveals which services are running and their status. An attacker can use this to infer which components to target. Add at minimum an internal network restriction or a simple secret-key check.

---

## 4. Configuration & Infrastructure Issues

### 🟠 HIGH-INF-01 — `.env` file committed to the repository

**File:** `.env`

```
VITE_API_BASE_URL=http://194.163.172.141:8081/api/v1
```
A `.env` file containing the actual server's public IP address is committed to the repository. This file must be added to `.gitignore` and removed from git history using `git filter-repo` or `BFG Repo-Cleaner`.

---

### 🟠 HIGH-INF-02 — No HTTPS in Nginx configuration

**File:** `nginx.conf`

The Nginx config only listens on port 80 (HTTP). The application handles authentication cookies and access tokens over an unencrypted channel. All traffic must be served over HTTPS with TLS 1.2+, and an HTTP-to-HTTPS redirect must be configured. The `secure: process.env.NODE_ENV === 'production'` cookie flag is currently meaningless because HTTPS is never enforced.

---

### 🟠 HIGH-INF-03 — Redis deployed without a password

**File:** `docker-compose.yml:27`

The Redis service has no `--requirepass` argument. Anyone who can reach the Redis port (e.g., after a container escape) can read/write job queues, potentially injecting malicious job payloads or stealing queue data.

---

### 🟡 MEDIUM-INF-04 — PostgreSQL default port in config is `5433`, not `5432`

**File:** `backend/src/config/index.ts:94`

```ts
port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
```
The standard PostgreSQL port is `5432`. Docker maps container port `5432`. Any environment that doesn't set `POSTGRES_PORT` will try to connect to the wrong port and fail.

---

### 🟡 MEDIUM-INF-05 — `minio/minio:latest` image tag in `docker-compose.yml`

**File:** `docker-compose.yml:42`

Using the `latest` tag means MinIO can be silently upgraded on any `docker-compose pull`, potentially introducing breaking API changes or regressions. Pin to a specific version (e.g., `minio/minio:RELEASE.2024-03-07T00-43-48Z`).

---

### 🔵 LOW-INF-06 — Backend debug and test server files in production source tree

**Files:** `backend/src/test-auth-server.ts`, `backend/src/test-server.ts`

Test/debug server files are in the production `src/` directory and will be compiled into the production build. They should be moved to a dedicated `test/` or `e2e/` directory.

---

### 🔵 LOW-INF-07 — Multiple debug HTML files committed to the repository root

**Files:** `CHECK-ERRORS-NOW.html`, `CHECK-WHAT-PORT.html`, `CLEAR-CACHE-NOW.html`, `DEBUG-LOGIN.md`, `DIAGNOSE-CONNECTION.html`, `FIX.html`, `INSPECT-FRONTEND.html`, `simple-login-test.html`, `test-login-flow.html`, `view-error-logs.html`

These are development artifacts. They contain implementation details (port numbers, API structure) and could expose internal architecture information. They must be deleted and added to `.gitignore`.

---

## 5. Frontend Issues

### 🟠 HIGH-FE-01 — Frontend task filter values don't match backend task statuses

**File:** `src/pages/TasksPage.jsx:11`

```js
const FILTERS = {
  ar: [['all', 'الكل'], ['active', 'نشط'], ['submitted', 'مُقدَّم'], ['revision', 'مراجعة'], ...],
```
The values `'active'` and `'revision'` are sent to `GET /tasks?status=active` and `?status=revision`. The backend's `tasks` table `CHECK` constraint has no `'active'` or `'revision'` status — valid values are `('draft','assigned','in_progress','submitted','under_review','approved','rejected','resubmission_required','closed','cancelled')`. These filters will return empty results.

---

### 🟡 MEDIUM-FE-02 — Frontend silently falls back to mock data on API failure

**Files:** `src/services/dashboardService.js:36`, `src/services/tasksService.js:72`

```js
} catch (err) {
  return getMockDashboard(); // returns hardcoded fake data
}
```
When the API fails (network error, 500, auth error), the frontend silently displays stale mock data. Users will see fabricated compliance percentages and task counts without any indication that the data is not real. This is dangerous for a compliance management system.

---

### 🟡 MEDIUM-FE-03 — App routing uses manual `pushState` instead of React Router

**File:** `src/App.jsx:113`

The application manages navigation via `window.history.pushState`, `?page=...` query parameters, and a `PAGE_COMPONENTS` dictionary. This approach:
- Breaks browser back/forward navigation in edge cases
- Does not support deep linking (bookmarking a specific task or submission)
- Cannot support lazy-loaded code splitting
- Is impossible to test with standard router test utilities

React Router (or similar) should replace this custom implementation.

---

### 🟡 MEDIUM-FE-04 — `collectRoleCandidates` in `TasksPage` indicates an inconsistent user model

**File:** `src/pages/TasksPage.jsx:22`

```js
const direct = [user.role, user.roleName, user.role_name, user.userRole, user.user_role];
```
This function probes 5 different possible role field names on the user object. This indicates the user object returned from different code paths (mock auth, real auth, localStorage restore) has inconsistent shape. The user model must be normalized to a single shape from a single source of truth.

---

### 🟡 MEDIUM-FE-05 — Notifications are never marked as read

**File:** `src/App.jsx:91`

Notifications are fetched on mount and stored as an array, but there is no UI action or API call that marks them as read. The unread count badge will always show all notifications as unread.

---

### 🔵 LOW-FE-06 — `DashboardPage` renders hardcoded `change` props on `StatCard`

**File:** `src/pages/DashboardPage.jsx:64`

```jsx
<StatCard ... change={12.3} ... />
<StatCard ... change={8.5} ... />
<StatCard ... change={5.2} ... />
```
The trend indicators (percentage changes) are hardcoded constants, not calculated from real historical data. This will mislead users into thinking compliance trends are improving when the data may be deteriorating.

---

### 🔵 LOW-FE-07 — `permissions.js` has no `'employee'` role mapping

**File:** `src/utils/permissions.js:2`

The backend seed creates the `'employee'` role, but the frontend `ROLE_PERMISSIONS` map uses `'user'` as the key. An authenticated `employee` will fall through to the `ROLE_PERMISSIONS.user` default, which happens to work only because the fallback is `ROLE_PERMISSIONS.user`. This coupling is fragile — if the fallback is ever changed, employees will lose all page access.

---

## 6. Code Quality & Maintainability Issues

### 🟡 MEDIUM-CQ-01 — Double login logging

**File:** `backend/src/modules/auth/auth.service.ts:176`  
**File:** `backend/src/modules/auth/auth.controller.ts:58`

`authService.login()` already logs `logger.info('User logged in')`. The controller then logs the same event immediately after. Every login generates two identical log entries, polluting audit log storage.

---

### 🟡 MEDIUM-CQ-02 — `asyncHandler` parameter typed as `Function` (no type safety)

**File:** `backend/src/utils/errors.ts:110`

```ts
export const asyncHandler = (fn: Function) => {
```
`Function` is an untyped escape hatch. The correct signature is:
```ts
type RouteHandler = (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export const asyncHandler = (fn: RouteHandler) => { ... }
```
Without this, TypeScript cannot catch misuse of `asyncHandler`.

---

### 🔵 LOW-CQ-03 — `reports.routes.ts` error response doesn't follow RFC 7807 format

**File:** `backend/src/modules/reports/reports.routes.ts:16`

```ts
res.status(400).json({ success: false, error: { message: 'Invalid report type' } });
```
All other error responses use the RFC 7807 Problem Details format (`type`, `title`, `status`, `detail`). This route uses a different format, creating inconsistency for API consumers.

---

### 🔵 LOW-CQ-04 — `UsersService.assignRole` deletes all existing roles before assigning

**File:** `backend/src/modules/users/users.service.ts:198`

```ts
await db.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
```
This is a non-transactional two-step operation. If the INSERT fails after the DELETE, the user ends up with **no role at all**. This must be wrapped in a transaction. Additionally, the `assigned_by` field in `user_roles` is not being set.

---

### 🔵 LOW-CQ-05 — `StorageService` constructor calls async method without awaiting

**File:** `backend/src/services/storage.service.ts:26`

```ts
constructor() {
  this.ensureBuckets(); // Fire-and-forget — errors are silently swallowed
}
```
`ensureBuckets()` is called but not awaited. The service is exported as a singleton at module load time, meaning it will start accepting file uploads before buckets are guaranteed to exist. Bucket creation errors are silently caught and logged, but the service continues operating with potentially non-existent buckets.

---

### 🔵 LOW-CQ-06 — `canViewPerspective` and `canEditPerspective` make redundant DB queries

**File:** `backend/src/middleware/auth.ts:156`

`canViewPerspective` queries the database for the user's role in a separate query, even though `req.user` (already hydrated by `authenticate`) contains the role in memory. These helper functions should accept `role` as a parameter rather than re-querying the database.

---

## 7. Summary by Severity

| Severity | Count |
|----------|-------|
| 🔴 Critical | 6 |
| 🟠 High | 10 |
| 🟡 Medium | 18 |
| 🔵 Low | 12 |
| **Total** | **46** |

---

## 8. Recommended Fix Priority

### Immediate (before any production deployment)
1. DB-01 — Fix `review_decisions` enum mismatch (`revision_requested` → `resubmission_required`)
2. DB-02 — Rewrite the SLA monitor job with correct column/table names
3. DB-04 — Fix `getTasksByUser` to use `s.name_ar`
4. DB-05 — Fix `getUsersList` `paramIndex` logic
5. API-01 — Add proper `authorize('task:update')` + state-machine check on `PUT /tasks/:id`
6. SEC-01 — Migrate access token from `localStorage` to `sessionStorage` or rotate to httpOnly cookie
7. SEC-02 — Remove all hardcoded mock credentials from `AuthContext.jsx`
8. INF-01 — Remove `.env` from version control; rotate the committed server IP
9. INF-02 — Add HTTPS/TLS to Nginx
10. DB-03 — Add `recalc_axis_completion` + `recalc_perspective_completion` calls after review approval

### Short-term (within 1 sprint)
11. DB-06 — Fix `completion_status` logic in the recalc function
12. API-02, API-03 — Add role-based filtering to submissions and reviews list endpoints
13. API-04 — Implement `roleId` update in `UsersService.updateUser`
14. API-06 — Replace hardcoded `partialCompliance` with real data
15. SEC-04 — HTML-escape all template variables in email notifications
16. SEC-05 — Implement actual virus scanning (ClamAV or equivalent)
17. API-05 — Add pagination to all list endpoints
18. INF-03 — Set a Redis password via `--requirepass`

### Medium-term (next 2 sprints)
19. DB-07 — Schedule materialized view refresh (pg_cron or application-level cron)
20. DB-12 — Populate `before_value`/`after_value` in audit logs
21. FE-01 — Align frontend task filter values with backend status enum
22. FE-02 — Remove mock data fallback in production
23. FE-03 — Migrate to React Router
24. DB-09 — Wrap `assignRole` in a transaction
25. Report job-status endpoint (API-08)
