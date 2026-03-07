import { env } from '../config/env.js';
import { request } from '../lib/httpClient.js';

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
      return MOCK_DEPARTMENTS;
    }

    try {
      const response = await request('/departments');
      const departments = response.data?.departments || [];
      if (departments.length === 0) return MOCK_DEPARTMENTS;

      return departments.map((department) => ({
        id: department.id,
        name: department.name_ar || department.name,
        name_en: department.name_en || department.name,
      }));
    } catch (error) {
      console.warn('Departments API failed, using mock data:', error);
      return MOCK_DEPARTMENTS;
    }
  },

  async getUnits() {
    if (env.useMockApi) {
      return MOCK_UNITS;
    }

    try {
      const response = await request('/units');
      const units = response.data?.units || [];
      if (units.length === 0) return MOCK_UNITS;

      return units.map((unit) => ({
        id: unit.id,
        name: unit.name_ar || unit.name,
        name_en: unit.name_en || unit.name,
        departmentId: unit.department_id,
      }));
    } catch (error) {
      console.warn('Units API failed, using mock data:', error);
      return MOCK_UNITS;
    }
  },
};

export default orgStructureService;
