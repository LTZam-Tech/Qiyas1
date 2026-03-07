-- Add missing columns to users table to match backend expectations

-- Add authentication-related columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- WARNING: FOR DEVELOPMENT / DEMO USE ONLY.
-- These passwords must be changed before deploying to any production environment.
-- Passwords: AdminPass123, DeanPass123, ConsultPass123, UserPass123
-- Hashes generated with bcrypt rounds=12 (verified valid)
INSERT INTO users (id, name, name_ar, email, password_hash, is_active, phone, department, job_title)
VALUES 
  (gen_random_uuid(), 'System Admin', 'مسؤول النظام', 'admin@university.edu', 
   '$2b$12$b6IM.PHya1.msVBrYRYcGecAmOYvoTHxf0D4.6r4iLFTU5ZJkaN7K', -- AdminPass123
   true, '+966501234567', 'IT Department', 'System Administrator'),
  
  (gen_random_uuid(), 'Dr. Ahmed Al-Qahtani', 'د. أحمد القحطاني', 'dean@university.edu',
   '$2b$12$/d9/oiu7gGMHUDX8lqCvzewGvDvgLg39wdHYr8z38q4t0ou1Twxw2', -- DeanPass123
   true, '+966502345678', 'Academic Affairs', 'Dean'),
  
  (gen_random_uuid(), 'Dr. Fatima Al-Harbi', 'د. فاطمة الحربي', 'consultant@qiyas.sa',
   '$2b$12$Y15dKXU2JyXlNnTluaJcQul7xEJGIO/qBrwMBVfpIiJcVvSl3hbDi', -- ConsultPass123
   true, '+966503456789', 'Quality Assurance', 'External Consultant'),
  
  (gen_random_uuid(), 'Sara Al-Mutairi', 'سارة المطيري', 'user@department.edu',
   '$2b$12$XG7ohwzuT0t8NalQWp6eEOhOKV9hDlOvCv/y41ss29FzOLhJbJUfq', -- UserPass123
   true, '+966504567890', 'Computer Science', 'Department Coordinator')
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = EXCLUDED.is_active;

-- Assign roles to users using user_roles table
WITH user_role_mapping AS (
  SELECT 
    u.id as user_id,
    r.id as role_id,
    u.id as assigned_by
  FROM users u
  CROSS JOIN roles r
  WHERE 
    (u.email = 'admin@university.edu' AND r.name = 'admin') OR
    (u.email = 'dean@university.edu' AND r.name = 'dean') OR
    (u.email = 'consultant@qiyas.sa' AND r.name = 'consultant') OR
    (u.email = 'user@department.edu' AND r.name = 'employee')
)
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT user_id, role_id, assigned_by FROM user_role_mapping
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Verify users were created
SELECT 
  u.name, 
  u.email, 
  r.name as role,
  u.is_active
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
WHERE u.email IN ('admin@university.edu', 'dean@university.edu', 'consultant@qiyas.sa', 'user@department.edu')
ORDER BY u.email;
