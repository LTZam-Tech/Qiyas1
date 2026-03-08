import { request } from '../lib/httpClient.js';
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

const usersService = {
  // Get all users (requires admin/dean role)
  async getUsers(filters = {}) {
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
      return users.map(normalizeUser);
    } catch (error) {
      errorLogger.logWarning('Users API failed', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      throw error;
    }
  },

  // Get user by ID
  async getUserById(userId) {
    const response = await request(`/users/${userId}`);
    const data = getResponseData(response);
    return data.user ? normalizeUser(data.user) : null;
  },
};

export default usersService;
