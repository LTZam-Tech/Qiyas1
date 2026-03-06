-- ========================================
-- SIMPLE SEED DATA
-- Password for all: Password123
-- Hash: $2a$12$Dq3kHKi8ZhYlhLoFaVcq3uz6qF5DvLnKDvfcH7kEPBLo1PHhxIQSi
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

-- Insert test users
INSERT INTO users (id, email, password_hash, full_name, created_at) VALUES
('a1111111-1111-1111-1111-111111111111', 'admin@test.com', '$2a$12$Dq3kHKi8ZhYlhLoFaVcq3uz6qF5DvLnKDvfcH7kEPBLo1PHhxIQSi', 'Admin User', NOW()),
('a2222222-2222-2222-2222-222222222222', 'dean@university.edu', '$2a$12$Dq3kHKi8ZhYlhLoFaVcq3uz6qF5DvLnKDvfcH7kEPBLo1PHhxIQSi', 'Dr. Ahmed Al-Qahtani', NOW()),
('a3333333-3333-3333-3333-333333333333', 'consultant@qiyas.sa', '$2a$12$Dq3kHKi8ZhYlhLoFaVcq3uz6qF5DvLnKDvfcH7kEPBLo1PHhxIQSi', 'Sarah Consultant', NOW()),
('a4444444-4444-4444-4444-444444444444', 'employee@test.com', '$2a$12$Dq3kHKi8ZhYlhLoFaVcq3uz6qF5DvLnKDvfcH7kEPBLo1PHhxIQSi', 'Mohamed Employee', NOW());

-- Assign roles
INSERT INTO user_roles (user_id, role) VALUES
('a1111111-1111-1111-1111-111111111111', 'admin'),
('a2222222-2222-2222-2222-222222222222', 'dean'),
('a3333333-3333-3333-3333-333333333333', 'consultant'),
('a4444444-4444-4444-4444-444444444444', 'employee');
