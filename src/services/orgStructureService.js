import { request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

const getResponseData = (response) => response?.data || response || {};

const normalizeDepartment = (department) => {
  const nameAr = department?.name_ar || department?.name || '';
  const nameEn = department?.name_en || department?.name || nameAr;
  return {
    ...department,
    name: nameAr,
    name_en: nameEn,
    nameAr,
    nameEn,
  };
};

const normalizeUnit = (unit) => {
  const nameAr = unit?.name_ar || unit?.name || '';
  const nameEn = unit?.name_en || unit?.name || nameAr;
  const departmentId = unit?.department_id || unit?.departmentId || '';
  return {
    ...unit,
    name: nameAr,
    name_en: nameEn,
    nameAr,
    nameEn,
    department_id: departmentId,
    departmentId,
  };
};

const orgStructureService = {
  async getDepartments() {
    try {
      const response = await request('/departments');
      const data = getResponseData(response);
      const departments = Array.isArray(data.departments) ? data.departments : [];
      return departments.map(normalizeDepartment);
    } catch (error) {
      errorLogger.logWarning('Departments API failed', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      throw error;
    }
  },

  async getUnits() {
    try {
      const response = await request('/units');
      const data = getResponseData(response);
      const units = Array.isArray(data.units) ? data.units : [];
      return units.map(normalizeUnit);
    } catch (error) {
      errorLogger.logWarning('Units API failed', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      throw error;
    }
  },
};

export default orgStructureService;
