import { env } from '../config/env.js';
import { request } from '../lib/httpClient.js';

const MOCK_DEPARTMENTS = [
  { id: 'dept-1', name: 'إدارة التحول الرقمي' },
  { id: 'dept-2', name: 'إدارة الجودة والالتزام' },
  { id: 'dept-3', name: 'إدارة البيانات والتحليلات' },
];

const MOCK_UNITS = [
  { id: 'unit-1', name: 'وحدة الحوكمة الرقمية' },
  { id: 'unit-2', name: 'وحدة إدارة المشاريع الرقمية' },
  { id: 'unit-3', name: 'وحدة المتابعة والتنفيذ' },
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
        name: department.name_ar || department.name || department.name_en,
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
        name: unit.name_ar || unit.name || unit.name_en,
        departmentId: unit.department_id,
      }));
    } catch (error) {
      console.warn('Units API failed, using mock data:', error);
      return MOCK_UNITS;
    }
  },
};

export default orgStructureService;
