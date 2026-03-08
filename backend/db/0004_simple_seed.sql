-- ========================================
-- SIMPLE SEED DATA
-- Contains only the 4 real system users.
-- 
-- admin@university.edu    -> AdminPass123
-- dean@university.edu     -> DeanPass123
-- consultant@qiyas.sa     -> ConsultPass123
-- employee@test.com       -> UserPass123
-- ========================================

-- Delete existing entries for these users (idempotent)
DELETE FROM user_roles WHERE user_id IN (
  SELECT id FROM users WHERE email IN (
    'admin@university.edu',
    'dean@university.edu',
    'consultant@qiyas.sa',
    'employee@test.com'
  )
);

DELETE FROM users WHERE email IN (
  'admin@university.edu',
  'dean@university.edu',
  'consultant@qiyas.sa',
  'employee@test.com'
);

-- Insert the 4 real system users (passwords are bcrypt hashes)
INSERT INTO users (id, email, password_hash, name, created_at) VALUES
('a1111111-1111-1111-1111-111111111111', 'admin@university.edu',    '$2b$12$b6IM.PHya1.msVBrYRYcGecAmOYvoTHxf0D4.6r4iLFTU5ZJkaN7K', 'System Admin',       NOW()),
('a2222222-2222-2222-2222-222222222222', 'dean@university.edu',     '$2b$12$/d9/oiu7gGMHUDX8lqCvzewGvDvgLg39wdHYr8z38q4t0ou1Twxw2', 'Dr. Dean',           NOW()),
('a3333333-3333-3333-3333-333333333333', 'consultant@qiyas.sa',     '$2b$12$Y15dKXU2JyXlNnTluaJcQul7xEJGIO/qBrwMBVfpIiJcVvSl3hbDi', 'External Consultant',NOW()),
('a4444444-4444-4444-4444-444444444444', 'employee@test.com',       '$2b$12$XG7ohwzuT0t8NalQWp6eEOhOKV9hDlOvCv/y41ss29FzOLhJbJUfq', 'Employee',           NOW())
ON CONFLICT (id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name;

-- Assign roles to the 4 real users
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u
JOIN roles r ON (
  (u.id = 'a1111111-1111-1111-1111-111111111111' AND r.name = 'admin') OR
  (u.id = 'a2222222-2222-2222-2222-222222222222' AND r.name = 'dean') OR
  (u.id = 'a3333333-3333-3333-3333-333333333333' AND r.name = 'consultant') OR
  (u.id = 'a4444444-4444-4444-4444-444444444444' AND r.name = 'employee')
)
ON CONFLICT (user_id, role_id) DO NOTHING;
