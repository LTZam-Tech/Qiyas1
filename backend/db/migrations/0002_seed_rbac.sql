INSERT INTO roles (name, name_ar, description, is_system)
VALUES
  ('admin', 'مسؤول النظام', 'Full system administration role', TRUE),
  ('dean', 'العميد', 'Governance and reporting authority', TRUE),
  ('consultant', 'المستشار', 'Reviewer and workflow supervisor', TRUE),
  ('vice_dean', 'وكيل العمادة', 'Senior reviewer and escalation role', TRUE),
  ('employee', 'الموظف', 'Evidence submitter role', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, module, action, description)
VALUES
  ('perspective:manage', 'hierarchy', 'manage', 'Create/update/archive perspectives and axes'),
  ('standard:manage', 'hierarchy', 'manage', 'Create/update/archive standards'),
  ('evidence_requirement:manage', 'evidence_requirement', 'manage', 'Manage evidence requirements and templates'),
  ('task:assign', 'task', 'assign', 'Assign and reassign tasks'),
  ('task:view_all', 'task', 'view_all', 'View all tasks with filters'),
  ('task:view_own', 'task', 'view_own', 'View only own assigned tasks'),
  ('evidence:submit', 'evidence', 'submit', 'Submit evidence files'),
  ('evidence:review', 'evidence', 'review', 'Review and decide evidence submissions'),
  ('evidence_vault:read', 'evidence_vault', 'read', 'Search and download approved evidence'),
  ('dashboard:read_global', 'dashboard', 'read_global', 'Read global dashboard and KPIs'),
  ('report:generate', 'report', 'generate', 'Request report generation jobs'),
  ('settings:manage', 'settings', 'manage', 'Manage platform settings and SLA policies'),
  ('user:manage', 'user', 'manage', 'Create/update/delete users and role assignments'),
  ('audit:read', 'audit', 'read', 'Read immutable audit log records')
ON CONFLICT (name) DO NOTHING;

WITH role_permission_map AS (
  SELECT 'admin'::text AS role_name, unnest(ARRAY[
    'perspective:manage','standard:manage','evidence_requirement:manage',
    'task:assign','task:view_all','task:view_own',
    'evidence:submit','evidence:review','evidence_vault:read',
    'dashboard:read_global','report:generate','settings:manage','user:manage','audit:read'
  ]) AS permission_name
  UNION ALL
  SELECT 'dean', unnest(ARRAY[
    'standard:manage','evidence_requirement:manage','task:assign','task:view_all',
    'evidence:review','evidence_vault:read','dashboard:read_global','report:generate','audit:read'
  ])
  UNION ALL
  SELECT 'consultant', unnest(ARRAY[
    'task:assign','task:view_all','evidence:review','evidence_vault:read','audit:read'
  ])
  UNION ALL
  SELECT 'vice_dean', unnest(ARRAY[
    'task:assign','task:view_all','evidence:review','evidence_vault:read','dashboard:read_global','audit:read'
  ])
  UNION ALL
  SELECT 'employee', unnest(ARRAY[
    'task:view_own','evidence:submit'
  ])
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_permission_map rpm
JOIN roles r ON r.name = rpm.role_name
JOIN permissions p ON p.name = rpm.permission_name
ON CONFLICT DO NOTHING;
