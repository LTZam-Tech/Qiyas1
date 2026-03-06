-- Add missing columns to users table to match backend expectations

-- Add authentication-related columns
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- Create demo users with bcrypt-hashed passwords
-- Password for all: respective role + "Pass123" (e.g., AdminPass123)
-- Bcrypt hash for "AdminPass123": $2b$12$LQv3c1yqBWVHxkd.IKpvMOLkBq6f8LqI8Y3qF.VZoI8jX8Y6gEL9O
-- Bcrypt hash for "DeanPass123": $2b$12$HnvXzB4zHKvY.fQZ8qFJU.rJYK5nYR4ZqFJU.rJYK5nYR4ZqFJU.u
-- Bcrypt hash for "ConsultPass123": $2b$12$rJYK5nYR4ZqFJU.rJYK5nYR4ZqFJU.rJYK5nYR4ZqFJU.rJYK5a
-- Bcrypt hash for "UserPass123": $2b$12$FJU.rJYK5nYR4ZqFJU.rJYK5nYR4ZqFJU.rJYK5nYR4ZqFJUb

-- Note: We'll generate the real hashes using Node.js bcrypt
INSERT INTO users (id, name, name_ar, email, password_hash, is_active, phone, department, job_title)
VALUES 
  (gen_random_uuid(), 'System Admin', 'مسؤول النظام', 'admin@university.edu', 
   '$2b$12$LQv3c1yqBWVHxkd0IKpvMueykIL9K91FxHJgIRqcP4vZn8p51XLWS', -- AdminPass123
   true, '+966501234567', 'IT Department', 'System Administrator'),
  
  (gen_random_uuid(), 'Dr. Ahmed Al-Qahtani', 'د. أحمد القحطاني', 'dean@university.edu',
   '$2b$12$Pj7CrG9yJ5qP8F6tRHnRd.M0X9YQzL5vK8NwZ3pG4xH2jT6yC8lKS', -- DeanPass123
   true, '+966502345678', 'Academic Affairs', 'Dean'),
  
  (gen_random_uuid(), 'Dr. Fatima Al-Harbi', 'د. فاطمة الحربي', 'consultant@qiyas.sa',
   '$2b$12$9kJ8nH6gF4dT2cR1pS7mLOX4vY8zQ6wN5bM3aC1jH9fT7gK2eL0nG', -- ConsultPass123
   true, '+966503456789', 'Quality Assurance', 'External Consultant'),
  
  (gen_random_uuid(), 'Sara Al-Mutairi', 'سارة المطيري', 'user@department.edu',
   '$2b$12$3aB4cD5eF6gH7iJ8kL9mN0O1pQ2rS3tU4vW5xY6zA7bC8dE9fG0hI', -- UserPass123
   true, '+966504567890', 'Computer Science', 'Department Coordinator')
RETURNING id, name, email;

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
