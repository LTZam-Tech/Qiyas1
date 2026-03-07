import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { PERSPECTIVES } from '../utils/data.js';

const perspectivesService = {
  async getPerspectives() {
    const localFallback = PERSPECTIVES.map((persp) => ({
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
      const perspectives = response.data?.perspectives || [];
      return perspectives.length > 0 ? perspectives : localFallback;
    } catch (error) {
      console.warn('Perspectives API failed, using local fallback:', error);
      return localFallback;
    }
  },
};

export default perspectivesService;
