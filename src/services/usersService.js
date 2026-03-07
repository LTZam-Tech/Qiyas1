import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';

const MOCK_USERS = [
  { id: 'user-1', full_name: 'د. أحمد محمد', email: 'ahmed@example.com', role: 'dean' },
  { id: 'user-2', full_name: 'د. فاطمة علي', email: 'fatima@example.com', role: 'consultant' },
  { id: 'user-3', full_name: 'أ. محمود حسن', email: 'mahmoud@example.com', role: 'user' },
  { id: 'user-4', full_name: 'أ. سارة خالد', email: 'sara@example.com', role: 'user' },
  { id: 'user-5', full_name: 'د. عمر إبراهيم', email: 'omar@example.com', role: 'user' },
];

const usersService = {
  // Get all users (requires admin/dean role)
  async getUsers(filters = {}) {
        if (env.useMockApi) {
          return MOCK_USERS;
        }
    
    const params = new URLSearchParams();
    if (filters.role) params.append('role', filters.role);
    if (filters.department) params.append('department', filters.department);
    if (filters.status) params.append('status', filters.status);

    const queryString = params.toString();
    const url = `/users${queryString ? `?${queryString}` : ''}`;
    
    const response = await request(url);
    return response.data?.users || [];
  },

  // Get user by ID
  async getUserById(userId) {
        if (env.useMockApi) {
          return MOCK_USERS.find(u => u.id === userId);
        }
    
    const response = await request(`/users/${userId}`);
    return response.data?.user;
  },
};

export default usersService;
