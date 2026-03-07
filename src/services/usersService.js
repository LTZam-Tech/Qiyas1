import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import errorLogger from './errorLogger.js';

const getResponseData = (response) => response?.data || response || {};

const normalizeUser = (user) => {
  const fullName = user?.fullName || user?.full_name || user?.name || '';
  const fullNameEn = user?.fullNameEn || user?.full_name_en || user?.name_en || fullName;

  return {
    ...user,
    fullName,
    fullNameEn,
    full_name: fullName,
    full_name_en: fullNameEn,
    name_ar: user?.name_ar || fullName,
    name_en: user?.name_en || fullNameEn,
  };
};

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
      return MOCK_USERS.map(normalizeUser);
    }

    const params = new URLSearchParams();
    if (filters.role) params.append('role', filters.role);
    if (filters.department) params.append('department', filters.department);
    if (filters.status) params.append('status', filters.status);

    const queryString = params.toString();
    const url = `/users${queryString ? `?${queryString}` : ''}`;

    try {
      const response = await request(url);
      const data = getResponseData(response);
      const users = Array.isArray(data.users) ? data.users : [];
      return users.length > 0 ? users.map(normalizeUser) : MOCK_USERS.map(normalizeUser);
    } catch (error) {
      errorLogger.logWarning('Users API failed, using mock data fallback', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      return MOCK_USERS.map(normalizeUser);
    }
  },

  // Get user by ID
  async getUserById(userId) {
    if (env.useMockApi) {
      const user = MOCK_USERS.find((u) => u.id === userId);
      return user ? normalizeUser(user) : null;
    }
    
    const response = await request(`/users/${userId}`);
    const data = getResponseData(response);
    return data.user ? normalizeUser(data.user) : null;
  },
};

export default usersService;
