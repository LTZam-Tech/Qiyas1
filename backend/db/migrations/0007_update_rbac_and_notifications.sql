-- Update RBAC to match new requirements
-- requirements:
-- admin: view, edit, add anything. Review all evidence.
-- dean: view only evidence locker, dashboard, all pages. can assign tasks.
-- consultant: super admin (domains, axes, standards), assign tasks, review evidence.
-- employee: view dashboard, receive and submit task, view evidence locker list.

-- Clear existing role permissions to start fresh for these roles
DELETE FROM role_permissions 
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('admin', 'dean', 'consultant', 'employee'));

-- Define role permissions based on new requirements
WITH fresh_role_permission_map AS (
  -- Admin: All permissions
  SELECT 'admin'::text AS role_name, p.name AS permission_name
  FROM permissions p
  
  UNION ALL
  
  -- Dean: View only access + task assignment
  SELECT 'dean', unnest(ARRAY[
    'task:assign',
    'task:view_all',
    'evidence_vault:read',
    'dashboard:read_global',
    'audit:read'
  ])
  
  UNION ALL
  
  -- Consultant: Super Admin (Hierarchy) + Review + Assign
  SELECT 'consultant', unnest(ARRAY[
    'perspective:manage',
    'standard:manage',
    'evidence_requirement:manage',
    'task:assign',
    'task:view_all',
    'evidence:review',
    'evidence_vault:read',
    'dashboard:read_global',
    'audit:read'
  ])
  
  UNION ALL
  
  -- Employee: View dashboard + Submit Task + View evidence list
  SELECT 'employee', unnest(ARRAY[
    'task:view_own',
    'evidence:submit',
    'evidence_vault:read',
    'dashboard:read_global'
  ])
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM fresh_role_permission_map rpm
JOIN roles r ON r.name = rpm.role_name
JOIN permissions p ON p.name = rpm.permission_name
ON CONFLICT DO NOTHING;

-- Any other manual updates if needed (e.g. status changes or new notification types)
