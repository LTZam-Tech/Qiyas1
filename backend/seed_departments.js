const { Client } = require('pg');

async function seedDepartments() {
  const client = new Client({
    user: 'QiyasUser',
    host: '127.0.0.1',
    database: 'Qiyas',
    password: 'Test123456',
    port: 5432
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    console.log('Clearing existing departments and units...');
    await client.query('DELETE FROM tasks'); // Tasks depend on departments/units
    await client.query('DELETE FROM units');
    await client.query('DELETE FROM departments');

    console.log('Inserting departments...');
    const depts = [
      { code: 'DEP-DT', name_en: 'Digital Transformation Department', name_ar: 'إدارة التحول الرقمي' },
      { code: 'DEP-IT', name_en: 'IT Department', name_ar: 'إدارة تقنية المعلومات' }
    ];

    let count = 0;
    for (const d of depts) {
      await client.query(`
        INSERT INTO departments (code, name_en, name_ar, status)
        VALUES ($1, $2, $3, 'active')
      `, [d.code, d.name_en, d.name_ar]);
      count++;
      console.log(`  ✓ Inserted ${d.name_en}`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ ${count} departments inserted successfully.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
  } finally {
    await client.end();
  }
}

seedDepartments();
