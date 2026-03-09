const { Client } = require('pg');

async function seedDomains() {
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

    // Get dean user ID to use as owner
    const deanRes = await client.query("SELECT id FROM users WHERE email = 'dean@university.edu'");
    const deanId = deanRes.rows[0]?.id;
    if (!deanId) throw new Error('Dean user not found');

    // 10 real compliance domains (D1–D10)
    const domains = [
      { code: 'D1', weight: 10, name_ar: 'الاستراتيجية والتخطيط', name_en: 'Strategy and Planning' },
      { code: 'D2', weight: 10, name_ar: 'المنظمة والثقافة', name_en: 'Organization and Culture' },
      { code: 'D3', weight: 10, name_ar: 'العمليات والتشغيل', name_en: 'Operations and Management' },
      { code: 'D4', weight: 10, name_ar: 'إدارة المخاطر واستمرارية الأعمال', name_en: 'Risk Management and Business Continuity' },
      { code: 'D5', weight: 10, name_ar: 'تقنية المعلومات', name_en: 'Information Technology' },
      { code: 'D6', weight: 10, name_ar: 'الحكومة الشاملة', name_en: 'Comprehensive Governance' },
      { code: 'D7', weight: 10, name_ar: 'القنوات والخدمات', name_en: 'Channels and Services' },
      { code: 'D8', weight: 10, name_ar: 'مركزية المستفيد', name_en: 'Beneficiary Centricity' },
      { code: 'D9', weight: 10, name_ar: 'البيانات الحكومية', name_en: 'Government Data' },
      { code: 'D10', weight: 10, name_ar: 'البحث والابتكار', name_en: 'Research and Innovation' },
    ];

    console.log('Inserting 10 compliance domains as perspectives...\n');

    for (let i = 0; i < domains.length; i++) {
      const d = domains[i];
      const res = await client.query(`
        INSERT INTO perspectives (code, name_en, name_ar, weight, sort_order, status, owner_id, created_by)
        VALUES ($1, $2, $3, $4, $5, 'active', $6, $6)
        ON CONFLICT (code) DO UPDATE SET
          name_en = EXCLUDED.name_en,
          name_ar = EXCLUDED.name_ar,
          weight  = EXCLUDED.weight,
          updated_at = NOW()
        RETURNING id, code, name_ar, name_en
      `, [d.code, d.name_en, d.name_ar, d.weight, i + 1, deanId]);

      const row = res.rows[0];
      console.log(`  ✓ ${row.code} | ${row.name_ar} | ${row.name_en}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ All 10 compliance domains seeded successfully.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedDomains();
