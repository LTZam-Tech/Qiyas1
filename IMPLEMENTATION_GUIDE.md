# Qiyas Platform - Full Implementation Guide

## 🎯 Overview

Complete E2E implementation of the Qiyas Compliance Platform with role-based authentication, comprehensive backend API, and interactive frontend.

## 🏗️ Architecture

### Backend (Node.js + TypeScript + PostgreSQL)
- **Framework**: Express.js 4.18
- **Database**: PostgreSQL 15 with pg driver
- **Cache/Queue**: Redis 7 + Bull queue
- **Storage**: MinIO S3-compatible
- **Auth**: JWT (15-min access + 30-day refresh tokens)
- **Validation**: Zod schemas
- **Email**: Nodemailer

### Frontend (React 19 + Vite)
- **UI Framework**: React 19 with functional components
- **State**: React Context API (AuthContext)
- **HTTP Client**: Custom fetch wrapper with interceptors
- **Styling**: CSS Modules
- **i18n**: Bilingual (Arabic RTL / English LTR)

## 🔐 Authentication System

### User Roles & Permissions

#### 1. **Admin** (Full Access)
- Dashboard, Catalog, Tasks, Evidence, Review, Reports, Analytics
- User management
- System configuration

#### 2. **Dean** (Academic Leadership)
- Dashboard, Catalog, Tasks, Evidence, Review, Reports, Analytics
- Review approvals
- Task assignment

#### 3. **Consultant** (External Reviewer)
- Dashboard, Tasks, Review, Reports
- Evidence review and approval
- Feedback submission

#### 4. **User** (Department Staff)
- Dashboard, Tasks, Evidence
- Upload evidence
- View assigned tasks

### Login Credentials (Demo)

```
📧 Dean:
   Email: dean@university.edu
   Password: DeanPass123

📧 Consultant:
   Email: consultant@qiyas.sa
   Password: ConsultPass123

📧 User:
   Email: user@department.edu
   Password: UserPass123
```

## 📁 Backend Structure

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/              # JWT authentication
│   │   ├── users/             # User management
│   │   ├── dashboard/         # Overview & KPIs
│   │   ├── perspectives/      # Top-level hierarchy
│   │   ├── axes/              # Second-level hierarchy
│   │   ├── standards/         # Third-level hierarchy
│   │   ├── tasks/             # Task assignments
│   │   ├── submissions/       # Evidence uploads
│   │   ├── reviews/           # Approval workflow
│   │   └── reports/           # Report generation
│   ├── jobs/
│   │   └── sla-monitor.ts     # Cron job (every 15 min)
│   ├── workers/
│   │   ├── email-notification.ts    # Email sender
│   │   └── report-generation.ts    # PDF/JSON reports
│   ├── queue/
│   │   └── index.ts           # Bull queue setup
│   ├── services/
│   │   └── storage.service.ts # MinIO file storage
│   ├── middleware/
│   │   ├── auth.ts            # JWT verify + RBAC
│   │   └── upload.ts          # Multer file upload
│   ├── db/
│   │   ├── index.ts           # PostgreSQL pool
│   │   ├── redis.ts           # Redis client
│   │   └── migrations/        # SQL migrations
│   └── utils/
│       ├── errors.ts          # Custom error classes
│       └── logger.ts          # Winston logger
```

## 📁 Frontend Structure

```
src/
├── pages/
│   ├── LoginPage.jsx          # ✨ New: Login with role demo
│   ├── DashboardPage.jsx      # KPIs & metrics
│   ├── CatalogPage.jsx        # Standards catalog
│   ├── TasksPage.jsx          # Task management
│   ├── EvidencePage.jsx       # Evidence locker
│   ├── ReviewPage.jsx         # Approval queue
│   └── ReportsPage.jsx        # Report downloads
├── components/
│   ├── layout/
│   │   ├── Header.jsx
│   │   ├── Sidebar.jsx        # ✨ Enhanced: Role badge
│   │   └── Layout.module.css
│   ├── Badge.jsx
│   ├── ProgressBar.jsx
│   ├── StatCard.jsx
│   └── ErrorBoundary.jsx
├── context/
│   ├── AuthContext.jsx        # ✨ Refactored: Backend integration
│   ├── authContextObject.js
│   └── useAuth.js
├── lib/
│   ├── authStorage.js         # LocalStorage wrapper
│   └── httpClient.js          # ✨ Enhanced: Interceptors
├── utils/
│   ├── permissions.js         # ✨ New: RBAC helpers
│   ├── data.js                # Mock data
│   └── theme.js               # Theme colors
└── App.jsx                    # ✨ Updated: Role-based routing
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker Desktop (for PostgreSQL, Redis, MinIO)
- npm or yarn

### 1. Start Infrastructure

```powershell
cd backend/infra
docker-compose up -d
```

**Services:**
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO: `localhost:9000` (Console: `localhost:9001`)

### 2. Backend Setup

```powershell
cd backend
npm install

# Run migrations
npm run migrate

# Build TypeScript
npm run build

# Start development server
npm run dev
```

Backend runs on **http://localhost:8000**

### 3. Frontend Setup

```powershell
cd ..  # Back to root
npm install

# Start Vite dev server
npm run dev
```

Frontend runs on **http://localhost:5173**

## 🔑 API Endpoints

### Authentication (`/api/v1/auth`)
```
POST   /login              # Login with email/password
POST   /register           # Register new user (admin only)
POST   /refresh            # Refresh access token
POST   /logout             # Logout (revoke refresh token)
GET    /me                 # Get current user profile
POST   /change-password    # Change password
```

### Users (`/api/v1/users`)
```
GET    /                   # List all users
GET    /:id                # Get user by ID
POST   /                   # Create user
PUT    /:id                # Update user
DELETE /:id                # Delete user (soft delete)
POST   /:id/assign-role    # Assign role to user
```

### Dashboard (`/api/v1/dashboard`)
```
GET    /overview           # KPIs + global completion
GET    /perspectives       # Perspectives with completion %
GET    /tasks              # Recent tasks summary
GET    /activity           # Recent activity feed
```

### Perspectives/Axes/Standards
```
GET    /api/v1/perspectives
POST   /api/v1/perspectives
GET    /api/v1/axes?perspectiveId=:id
GET    /api/v1/standards?axisId=:id
```

### Tasks (`/api/v1/tasks`)
```
GET    /                   # List tasks (role-based filtering)
GET    /my-tasks           # Current user's tasks
GET    /:id                # Get task details
POST   /                   # Create task (admin/dean)
PUT    /:id                # Update task
GET    /overdue            # Get overdue tasks
```

### Submissions (`/api/v1/submissions`)
```
GET    /                   # List submissions
GET    /:id                # Get submission details
POST   /                   # Upload evidence (multipart/form-data)
GET    /:id/files/:fileId/download  # Download file (signed URL)
```

### Reviews (`/api/v1/reviews`)
```
GET    /                   # List reviews
GET    /:id                # Get review details
POST   /                   # Submit review decision
                          # (approved | rejected | revision_requested)
```

### Reports (`/api/v1/reports`)
```
POST   /generate          # Generate report (async job)
                         # types: completion | detailed | dashboard_snapshot
```

## 🛡️ Security Features

### Backend
- [x] JWT with RS256 (or HS256 for dev)
- [x] Refresh token rotation
- [x] httpOnly cookies for refresh tokens
- [x] Password hashing (bcrypt, 12 rounds)
- [x] Rate limiting (100 req/min)
- [x] SQL injection prevention (parameterized queries)
- [x] XSS protection (Helmet middleware)
- [x] CORS configuration
- [x] File upload validation (MIME type + size)
- [x] Audit logging (all mutations)

### Frontend
- [x] XSS protection (React auto-escaping)
- [x] CSRF protection (SameSite cookies)
- [x] Secure token storage (LocalStorage + httpOnly refresh)
- [x] Automatic token refresh
- [x] Role-based UI rendering
- [x] Page access validation

## 📊 Database Schema

### Core Tables
- `users` - User accounts
- `roles` - Role definitions
- `permissions` - Permission definitions
- `role_permissions` - RBAC mapping
- `perspectives` - Top-level compliance areas
- `axes` - Second-level categories
- `standards` - Compliance standards
- `evidence_requirements` - Required evidence per standard
- `tasks` - Assigned compliance tasks
- `evidence_submissions` - Uploaded evidence files
- `review_decisions` - Approval/rejection records
- `refresh_tokens` - JWT refresh tokens
- `audit_logs` - System activity log

### Materialized Views
- `global_completion_mv` - Overall completion percentage
- `dashboard_snapshots` - Periodic dashboard cache

### Functions
- `recalc_standard_completion(standard_id)` - Recalculate completion %
- `recalc_axis_completion(axis_id)` - Cascade to axis level
- `recalc_perspective_completion(perspective_id)` - Cascade to perspective
- `recalc_global_completion()` - Update global percentage

## 🎨 UI Features

### Login Page
- Modern gradient design
- Bilingual labels (AR/EN)
- Show/hide password toggle
- Demo credentials displayed
- Responsive (mobile-first)
- Loading states
- Error handling

### Dashboard
- KPI cards with gradients
- Completion progress bars
- Recent activity feed
- Bottleneck alerts
- Perspective breakdown
- Arabic RTL support

### Navigation
- Role-based menu filtering
- Collapsible sidebar
- Search functionality
- Mobile responsive
- Dark mode ready
- Bilingual labels

### Components
- StatCard - Metric display with icons
- ProgressBar - Visual completion indicator
- Badge - Status tags with colors
- ErrorBoundary - Graceful error handling

## 🔧 Configuration

### Backend (.env)
```ini
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=qiyas_platform
POSTGRES_USER=qiyas_user
POSTGRES_PASSWORD=change_me

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# JWT
JWT_ACCESS_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Upload
UPLOAD_MAX_FILE_SIZE_MB=25
UPLOAD_ALLOWED_TYPES=pdf,docx,xlsx,png,jpg,jpeg

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASSWORD=your-password
SMTP_FROM=Qiyas Platform <noreply@qiyas.sa>

# Frontend
FRONTEND_URL=http://localhost:5173
```

### Frontend (vite.config.js)
```js
export default {
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
};
```

## 🧪 Testing

### Backend Tests
```powershell
cd backend
npm run test          # Run Jest tests
npm run test:watch    # Watch mode
npm run typecheck     # TypeScript validation
npm run lint          # ESLint
```

### Frontend Tests
```powershell
npm run test          # Run Vitest
npm run test:run      # Run once (CI mode)
```

### E2E Testing Checklist
- [ ] Login with each role
- [ ] Navigate to accessible pages
- [ ] Upload evidence file
- [ ] Create and assign task
- [ ] Submit review decision
- [ ] Generate report
- [ ] Logout and re-login

## 📦 Deployment

### Backend
```powershell
cd backend
npm run build
npm start
```

### Frontend
```powershell
npm run build
# Outputs to dist/ folder
# Deploy to Nginx/Apache/CDN
```

### Docker (Production)
```yaml
services:
  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
    ports:
      - "8000:8000"
    
  frontend:
    build: .
    ports:
      - "80:80"
```

## 🐛 Troubleshooting

### Backend won't start
```powershell
# Rebuild bcrypt for your Node version
npm rebuild bcrypt

# Check Docker containers
docker ps
docker logs qiyas-postgres
docker logs qiyas-redis
docker logs qiyas-minio
```

###Frontend API errors
```jsx javascript
// Check API base URL in src/config/env.js
export const env = {
  apiBaseUrl: 'http://localhost:8000/api/v1',
  requestTimeoutMs: 30000,
};
```

### Database migration issues
```powershell
# Reset database (caution: deletes data)
cd backend/infra
docker-compose down -v
docker-compose up -d
cd ../db/migrations
# Run migrations manually
```

## 📚 Key Files Modified/Created

### ✨ New Files
- `src/pages/LoginPage.jsx` - Login UI
- `src/pages/LoginPage.module.css` - Login styles
- `src/utils/permissions.js` - RBAC helpers
- `src/context/AuthContext.test.jsx` - Auth tests
- `backend/src/queue/index.ts` - Queue setup
- `backend/src/jobs/sla-monitor.ts` - Cron job
- `backend/src/workers/email-notification.ts` - Email worker
- `backend/src/workers/report-generation.ts` - Report worker

### 🔧 Enhanced Files
- `src/context/AuthContext.jsx` - Backend API integration
- `src/App.jsx` - Role-based routing
- `src/components/layout/Sidebar.jsx` - Role badge
- `src/lib/httpClient.js` - Added interceptors
- `backend/src/modules/users/users.service.ts` - Fixed nullable departmentId
- `backend/src/modules/reports/reports.routes.ts` - Fixed return type

## 🎯 Phase Completion Status

### ✅ Phase 1: Infrastructure (100%)
- Docker Compose setup
- PostgreSQL + Redis + MinIO
- Database migrations
- RBAC seed data
- Environment configuration

### ✅ Phase 2: Core Modules (100%)
- Authentication (login/refresh/logout)
- User management
- Hierarchy (Perspectives/Axes/Standards)
- Tasks & assignments
- Evidence submissions (with file upload)
- Review workflow (with completion tracking)
- Dashboard API

### ✅ Phase 3: Advanced Features (100%)
- Job queue (Bull + Redis)
- SLA monitoring (15-min cron)
- Email notifications
- Report generation
- Role-based access control
- Login page with role demo
- Protected routes

### ✅ Phase 4: Frontend Polish (100%)
- Login page design
- Role-based navigation
- Auth integration
- Error handling
- Loading states
- Responsive design

## 🚀 Next Steps (Optional Enhancements)

1. **PDF Report Generation** - Use `pdfkit` or `puppeteer`
2. **Real-time Notifications** - WebSocket with Socket.io
3. **File Virus Scanning** - Integrate ClamAV
4. **Multi-factor Authentication** - TOTP with `speakeasy`
5. **Advanced Analytics** - Charts with Chart.js/Recharts
6. **Audit Trail UI** - Browse activity logs
7. **Internationalization** - i18next for translations
8. **Email Templates** - Handlebars templates
9. **API Documentation** - Swagger/OpenAPI
10. **Performance Monitoring** - New Relic / DataDog

## 📞 Support

For issues or questions:
- Check logs: `backend/logs/`
- Review error responses in Network tab
- Verify Docker containers are healthy
- Check `.env` configuration

---

**Built with ❤️ for Academic Compliance**
