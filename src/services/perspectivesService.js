import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { PERSPECTIVES } from '../utils/data.js';

const perspectivesService = {
  async getPerspectives() {
    if (env.useMockApi) {
      return PERSPECTIVES.map((persp) => ({
        id: String(persp.id),
        code: persp.code,
        name_ar: persp.name,
        name_en: persp.nameEn,
      }));
    }

    const response = await request('/perspectives');
    return response.data?.perspectives || [];
  },
};

export default perspectivesService;
