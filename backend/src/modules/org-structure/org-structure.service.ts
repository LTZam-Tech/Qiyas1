import db from '@/db';

class OrgStructureService {
  async getDepartments() {
    const result = await db.query(
      `SELECT id, code, name_en, name_ar
       FROM departments
       WHERE deleted_at IS NULL AND status = 'active'
       ORDER BY name_ar ASC`
    );

    return result.rows;
  }

  async getUnits(departmentId?: string) {
    const params: unknown[] = [];
    let query = `
      SELECT u.id, u.department_id, u.code, u.name_en, u.name_ar, d.name_ar AS department_name_ar
      FROM units u
      JOIN departments d ON d.id = u.department_id
      WHERE u.deleted_at IS NULL
        AND u.status = 'active'
        AND d.deleted_at IS NULL
        AND d.status = 'active'
    `;

    if (departmentId) {
      query += ' AND u.department_id = $1';
      params.push(departmentId);
    }

    query += ' ORDER BY u.name_ar ASC';

    const result = await db.query(query, params);
    return result.rows;
  }
}

export default new OrgStructureService();
