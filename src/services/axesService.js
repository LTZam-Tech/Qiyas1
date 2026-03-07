import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { AXES } from '../utils/data.js';

const axesService = {
  async getAxes(perspectiveId) {
    if (env.useMockApi) {
      return AXES
        .filter((axis) => String(axis.perspId) === String(perspectiveId))
        .map((axis) => ({
          id: String(axis.id),
          code: axis.code,
          name_ar: axis.name,
          name_en: axis.nameEn,
          perspective_id: String(axis.perspId),
        }));
    }

    const response = await request('/axes', { method: 'GET' }, { perspectiveId });
    return response.data?.axes || [];
  },
};

export default axesService;
