-- ========================================
-- SIMPLE SEED DATA -- FOR TESTING ONLY
-- WARNING: Do NOT use in production environments.
-- These accounts use a shared weak password for convenience.
-- Password for all: Password123
-- Hash: $2b$12$VTAkT0.rQRPpXqPOCUzK/.M6bGAMmB.WoH9C5YOXHOR/7XGkO6IMK
-- ========================================

-- Delete existing test data
DELETE FROM user_roles WHERE user_id IN (
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333',
  'a4444444-4444-4444-4444-444444444444'
);

DELETE FROM users WHERE id IN (
  'a1111111-1111-1111-1111-111111111111',
  'a2222222-2222-2222-2222-222222222222',
  'a3333333-3333-3333-3333-333333333333',
  'a4444444-4444-4444-4444-444444444444'
);

-- Insert test users (using 'name' column per schema in 0001_init.sql)
INSERT INTO users (id, email, password_hash, name, created_at) VALUES
('a1111111-1111-1111-1111-111111111111', 'admin@test.com', '$2b$12$VTAkT0.rQRPpXqPOCUzK/.M6bGAMmB.WoH9C5YOXHOR/7XGkO6IMK', 'Admin User', NOW()),
('a2222222-2222-2222-2222-222222222222', 'dean@university.edu', '$2b$12$VTAkT0.rQRPpXqPOCUzK/.M6bGAMmB.WoH9C5YOXHOR/7XGkO6IMK', 'Dr. Ahmed Al-Qahtani', NOW()),
('a3333333-3333-3333-3333-333333333333', 'consultant@qiyas.sa', '$2b$12$VTAkT0.rQRPpXqPOCUzK/.M6bGAMmB.WoH9C5YOXHOR/7XGkO6IMK', 'Sarah Consultant', NOW()),
('a4444444-4444-4444-4444-444444444444', 'employee@test.com', '$2b$12$VTAkT0.rQRPpXqPOCUzK/.M6bGAMmB.WoH9C5YOXHOR/7XGkO6IMK', 'Mohamed Employee', NOW())
ON CONFLICT (id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name;

-- Assign roles using role_id from the roles table
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
