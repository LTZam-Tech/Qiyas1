// Role-based navigation access control
export const ROLE_PERMISSIONS = {
  admin: [
    'dashboard',
    'catalog',
    'tasks',
    'evidence',
    'evidence-list',
    'review',
    'approvals',
    'reports',
    'analytics',
    'error-logs',
  ],
  dean: [
    'dashboard',
    'catalog',
    'tasks',
    'evidence',
    'evidence-list',
    'review',
    'approvals',
    'reports',
    'analytics',
    'error-logs',
  ],
  consultant: [
    'dashboard',
    'tasks',
    'review',
    'approvals',
    'reports',
    'error-logs',
  ],
  user: [
    'dashboard',
    'tasks',
    'evidence',
    'evidence-list',
    'error-logs',
  ],
};

export function filterNavByRole(navItems, userRole) {
  if (!userRole) return [];
  
  const allowedPages = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.user;
  
  return navItems
    .map((item) => {
      // If it's a group, filter its children
      if (item.isGroup && item.children) {
        const filteredChildren = item.children.filter((child) =>
          allowedPages.includes(child.key)
        );
        
        // Only include the group if it has accessible children
        if (filteredChildren.length > 0) {
          return {
            ...item,
            children: filteredChildren,
          };
        }
        return null;
      }
      
      // For non-group items, check if user has access
      if (allowedPages.includes(item.key)) {
        return item;
      }
      
      return null;
    })
    .filter(Boolean);
}

export function canAccessPage(page, userRole) {
  if (!userRole) return false;
  const allowedPages = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS.user;
  return allowedPages.includes(page);
}
