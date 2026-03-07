import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { PERSPECTIVES } from '../utils/data.js';
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
    const localFallback = PERSPECTIVES.map((persp) => normalizePerspective({
      id: String(persp.id),
      code: persp.code,
      name_ar: persp.name,
      name_en: persp.nameEn,
    }));

    if (env.useMockApi) {
      return localFallback;
    }

    try {
      const response = await request('/perspectives');
      const data = getResponseData(response);
      const perspectives = Array.isArray(data.perspectives) ? data.perspectives : [];
      return perspectives.length > 0 ? perspectives.map(normalizePerspective) : localFallback;
    } catch (error) {
      errorLogger.logWarning('Perspectives API failed, using local fallback', 'backend', {
        message: error?.message,
        status: error?.status,
      });
      return localFallback;
    }
  },
};

export default perspectivesService;
