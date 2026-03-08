import { request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

const getResponseData = (response) => response?.data || response || {};

const normalizeStandard = (standard) => {
  const title = standard?.title || standard?.name || standard?.name_ar || '';
  const axisId = standard?.axis_id || standard?.axisId || '';

  return {
    ...standard,
    title,
    name: standard?.name || title,
    name_ar: standard?.name_ar || title,
    name_en: standard?.name_en || standard?.name || title,
    axis_id: String(axisId),
    axisId: String(axisId),
  };
};

const standardsService = {
  // Get all standards
  async getStandards(axisId) {
    try {
      const url = axisId ? `/standards?axisId=${axisId}` : '/standards';
      const response = await request(url);
      const data = getResponseData(response);
      const standards = Array.isArray(data.standards) ? data.standards : [];
      return standards.map(normalizeStandard);
    } catch (error) {
      errorLogger.logWarning('Standards API failed', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      throw error;
    }
  },

  // Get standard by ID with evidence requirements
  async getStandardById(standardId) {
    const response = await request(`/standards/${standardId}`);
    const data = getResponseData(response);
    return data.standard ? normalizeStandard(data.standard) : null;
  },
};

export default standardsService;
