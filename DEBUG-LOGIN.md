# 🔍 Login Debugging Guide

## Current Status: All Backend Systems Working ✅

- ✅ Database: 4 users with correct passwords
- ✅ Backend API: Login endpoint working perfectly
- ✅ CORS: Configured for localhost:5173
- ✅ Frontend: Serving correct environment (API on port 3001)

## If Login Still Fails - Follow These Steps:

### Step 1: Clear Browser Storage
The browser may have old authentication state cached.

**Open browser console (F12) and run:**
```javascript
localStorage.clear();
location.reload();
```

### Step 2: Hard Refresh
Press **Ctrl+Shift+R** or **Ctrl+F5** to force reload all JavaScript files.

### Step 3: Check Console for Errors
1. Open DevTools (F12)
2. Go to **Console** tab
3. Try to login
4. Look for any red error messages
5. Take screenshot if you see errors

### Step 4: Use Test Page
Open this file in your browser:
```
file:///C:/Users/alaaa/projects/qiyas-portal/test-login-flow.html
```

Click each button to verify:
- Backend health
- Login for each user
- Auth/me endpoint
- CORS headers

### Step 5: Network Tab Inspection
1. Open DevTools (F12)
2. Go to **Network** tab
3. Try to login with `dean@university.edu` / `DeanPass123`
4. Look for the `/auth/login` request
5. Check:
   - **Request URL**: Should be `http://localhost:3001/api/v1/auth/login`
   - **Status**: Should be `200 OK`
   - **Response**: Should have `"success": true` and `accessToken`

If you see:
- ❌ **Failed to fetch** → Backend not reachable
- ❌ **401 Unauthorized** → Wrong password (shouldn't happen with our test credentials)
- ❌ **404 Not Found** → Wrong URL (frontend pointing to wrong API)
- ❌ **CORS error** → Origin not allowed (shouldn't happen after our CORS fix)

---

## Test Credentials (All Working)

| Email | Password | Role |
|-------|----------|------|
| admin@university.edu | AdminPass123 | Admin |
| dean@university.edu | DeanPass123 | Dean |
| consultant@qiyas.sa | ConsultPass123 | Consultant |
| employee@test.com | UserPass123 | Employee |

---

## Manual Backend Test (PowerShell)

Run this to verify backend works directly:
```powershell
$body = @{ email='dean@university.edu'; password='DeanPass123' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/api/v1/auth/login' -ContentType 'application/json' -Body $body
```

Should return user data and accessToken.

---

## If Nothing Works

1. Check both services are running:
   ```powershell
   # Backend
   Invoke-RestMethod http://localhost:3001/health
   
   # Frontend
   Invoke-WebRequest http://localhost:5173 -UseBasicParsing
   ```

2. Restart both services:
   ```powershell
   # Stop and restart backend (from backend folder)
   npm run dev
   
   # Stop and restart frontend (from root folder)
   npm run dev
   ```

3. Share the browser console output with me so I can see the exact error.
