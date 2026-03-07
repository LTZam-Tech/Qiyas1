import { request } from '../lib/httpClient.js';
import { env } from '../config/env.js';
import { AXES } from '../utils/data.js';

const axesService = {
  async getAxes(perspectiveId) {
    const localFallback = AXES
      .filter((axis) => String(axis.perspId) === String(perspectiveId))
      .map((axis) => ({
        id: String(axis.id),
        code: axis.code,
        name_ar: axis.name,
        name_en: axis.nameEn,
        perspective_id: String(axis.perspId),
      }));

    if (env.useMockApi) {
      return localFallback;
    }

    try {
      const response = await request('/axes', { method: 'GET' }, { perspectiveId });
      const axes = response.data?.axes || [];
      return axes.length > 0 ? axes : localFallback;
    } catch (error) {
      console.warn('Axes API failed, using local fallback:', error);
      return localFallback;
    }
  },
};

export default axesService;
