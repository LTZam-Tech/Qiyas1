import { env } from '../config/env.js';
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

const MOCK_DEPARTMENTS = [
  { id: 'dept-1', name: 'إدارة التحول الرقمي', name_en: 'Digital Transformation Department' },
  { id: 'dept-2', name: 'إدارة الجودة والالتزام', name_en: 'Quality & Compliance Department' },
  { id: 'dept-3', name: 'إدارة البيانات والتحليلات', name_en: 'Data & Analytics Department' },
];

const MOCK_UNITS = [
  { id: 'unit-1', name: 'وحدة الحوكمة الرقمية', name_en: 'Digital Governance Unit' },
  { id: 'unit-2', name: 'وحدة إدارة المشاريع الرقمية', name_en: 'Digital Project Management Unit' },
  { id: 'unit-3', name: 'وحدة المتابعة والتنفيذ', name_en: 'Follow-up & Implementation Unit' },
];

const orgStructureService = {
  async getDepartments() {
    if (env.useMockApi) {
      return MOCK_DEPARTMENTS.map(normalizeDepartment);
    }

    try {
      const response = await request('/departments');
      const data = getResponseData(response);
      const departments = Array.isArray(data.departments) ? data.departments : [];
      if (departments.length === 0) return MOCK_DEPARTMENTS.map(normalizeDepartment);

      return departments.map(normalizeDepartment);
    } catch (error) {
      errorLogger.logWarning('Departments API failed, using mock data fallback', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      return MOCK_DEPARTMENTS.map(normalizeDepartment);
    }
  },

  async getUnits() {
    if (env.useMockApi) {
      return MOCK_UNITS.map(normalizeUnit);
    }

    try {
      const response = await request('/units');
      const data = getResponseData(response);
      const units = Array.isArray(data.units) ? data.units : [];
      if (units.length === 0) return MOCK_UNITS.map(normalizeUnit);

      return units.map(normalizeUnit);
    } catch (error) {
      errorLogger.logWarning('Units API failed, using mock data fallback', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      return MOCK_UNITS.map(normalizeUnit);
    }
  },
};

export default orgStructureService;
