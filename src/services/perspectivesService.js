import { request } from '../lib/httpClient.js';
import errorLogger from './errorLogger.js';

const getResponseData = (response) => response?.data || response || {};

const normalizePerspective = (perspective) => {
  const nameAr = perspective?.name_ar || perspective?.nameAr || perspective?.name || '';
  const nameEn = perspective?.name_en || perspective?.nameEn || perspective?.name || '';

  return {
    ...perspective,
    name_ar: nameAr,
    name_en: nameEn,
    nameAr,
    nameEn,
  };
};

const perspectivesService = {
  async getPerspectives() {
    try {
      const response = await request('/perspectives');
      const data = getResponseData(response);
      const perspectives = Array.isArray(data.perspectives) ? data.perspectives : [];
      return perspectives.map(normalizePerspective);
    } catch (error) {
      errorLogger.logWarning('Perspectives API failed', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      throw error;
    }
  },
};

export default perspectivesService;
