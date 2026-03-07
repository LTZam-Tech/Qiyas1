import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';

const MOCK_USERS = [
  { id: 'user-1', full_name: 'د. أحمد محمد', full_name_en: 'Dr. Ahmed Mohammed', email: 'ahmed@example.com', role: 'dean', role_ar: 'عميد' },
  { id: 'user-2', full_name: 'د. فاطمة علي', full_name_en: 'Dr. Fatima Ali', email: 'fatima@example.com', role: 'consultant', role_ar: 'مستشار' },
  { id: 'user-3', full_name: 'أ. محمود حسن', full_name_en: 'Mahmoud Hassan', email: 'mahmoud@example.com', role: 'user', role_ar: 'مستخدم' },
  { id: 'user-4', full_name: 'أ. سارة خالد', full_name_en: 'Sarah Khaled', email: 'sara@example.com', role: 'user', role_ar: 'مستخدم' },
  { id: 'user-5', full_name: 'د. عمر إبراهيم', full_name_en: 'Dr. Omar Ibrahim', email: 'omar@example.com', role: 'user', role_ar: 'مستخدم' },
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

    try {
      const response = await request(url);
      const users = response.data?.users || [];
      return users.length > 0 ? users : MOCK_USERS;
    } catch (error) {
      console.warn('Users API failed, using mock data:', error);
      return MOCK_USERS;
    }
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
