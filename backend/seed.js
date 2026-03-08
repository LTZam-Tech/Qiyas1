const { Client } = require('pg');

async function seed() {
  const client = new Client({
    user: 'QiyasUser',
    host: '127.0.0.1',
    database: 'Qiyas',
    password: 'Test123456',
    port: 5432
  });

  try {
    await client.connect();

    // 1. Get Dean User
    const res = await client.query("SELECT id FROM users WHERE email = 'dean@university.edu'");
    const deanId = res.rows[0]?.id;
    if (!deanId) throw new Error("Dean user not found.");

    // 2. Insert Perspective
    const pRes = await client.query(`
      INSERT INTO perspectives (code, name_en, name_ar, description_en, description_ar, weight, owner_id)
      VALUES ('P1', 'Institutional Perspective', 'المنظور المؤسسي', 'Description', 'الوصف', 25.0, $1)
      RETURNING id;
    `, [deanId]);
    const perspectiveId = pRes.rows[0].id;

    // 3. Insert Axis
    const aRes = await client.query(`
      INSERT INTO axes (perspective_id, code, name_en, name_ar, weight)
      VALUES ($1, 'A1', 'Governance Axis', 'محور الحوكمة', 50.0)
      RETURNING id;
    `, [perspectiveId]);
    const axisId = aRes.rows[0].id;

    // 4. Insert Standard
    const sRes = await client.query(`
      INSERT INTO standards (axis_id, code, name_en, name_ar, weight, owner_id)
      VALUES ($1, 'STD-1', 'Governance Standard 1', 'معيار الحوكمة 1', 100.0, $2)
      RETURNING id;
    `, [axisId, deanId]);
    const standardId = sRes.rows[0].id;

    // 5. Insert Evidence Requirement
    await client.query(`
      INSERT INTO evidence_requirements (standard_id, code, title_en, title_ar)
      VALUES ($1, 'REQ-1', 'Submission Document', 'وثيقة التقديم');
    `, [standardId]);

    console.log('Database successfully seeded with valid Perspective -> Axis -> Standard hierarchy UUIDs.');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await client.end();
  }
}

seed();
