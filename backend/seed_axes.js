const { Client } = require('pg');

async function seedAxes() {
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

    // ── Step 1: Clear all dependent data first (cascade order) ──────────────
    console.log('Clearing existing data...');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM evidence_requirements');
    await client.query('DELETE FROM standards');
    await client.query('DELETE FROM axes');
    console.log('  ✓ Cleared axes, standards, evidence_requirements, tasks\n');

    // ── Step 2: Build domain code → id map ──────────────────────────────────
    const perspRes = await client.query('SELECT id, code FROM perspectives WHERE deleted_at IS NULL');
    const domainMap = {};
    perspRes.rows.forEach(r => { domainMap[r.code] = r.id; });

    // ── Step 3: Define the 24 axes (domain_code, sort, name_ar, name_en) ────
    const axes = [
      // D1 – الاستراتيجية والتخطيط
      { domain: 'D1', sort: 1, name_ar: 'التخطيط للتحول الرقمي',        name_en: 'Digital Transformation Planning' },
      { domain: 'D1', sort: 2, name_ar: 'حوكمة التحول الرقمي',           name_en: 'Digital Transformation Governance' },
      { domain: 'D1', sort: 3, name_ar: 'البنية المؤسسية',                name_en: 'Institutional Architecture' },
      // D2 – المنظمة والثقافة
      { domain: 'D2', sort: 1, name_ar: 'الثقافة والبيئة الرقمية',         name_en: 'Digital Culture and Environment' },
      { domain: 'D2', sort: 2, name_ar: 'تطوير قيادات التحول الرقمي',     name_en: 'Digital Transformation Leadership Development' },
      { domain: 'D2', sort: 3, name_ar: 'بناء الكفاءات',                  name_en: 'Competency Building' },
      // D3 – العمليات والتشغيل
      { domain: 'D3', sort: 1, name_ar: 'إجراءات العمل',                  name_en: 'Work Procedures' },
      // D4 – إدارة المخاطر واستمرارية الأعمال
      { domain: 'D4', sort: 1, name_ar: 'إدارة المخاطر',                  name_en: 'Risk Management' },
      { domain: 'D4', sort: 2, name_ar: 'استمرارية الأعمال',              name_en: 'Business Continuity' },
      // D5 – تقنية المعلومات
      { domain: 'D5', sort: 1, name_ar: 'الأنظمة الداعمة للتحول الرقمي', name_en: 'Systems Supporting Digital Transformation' },
      { domain: 'D5', sort: 2, name_ar: 'البنية التحتية للخدمات التقنية', name_en: 'Technical Services Infrastructure' },
      { domain: 'D5', sort: 3, name_ar: 'البنية السحابية',                name_en: 'Cloud Architecture' },
      // D6 – الحكومة الشاملة
      { domain: 'D6', sort: 1, name_ar: 'منصات الحكومة الشاملة',          name_en: 'Comprehensive Government Platforms' },
      // D7 – القنوات والخدمات
      { domain: 'D7', sort: 1, name_ar: 'جودة الخدمات الرقمية',           name_en: 'Digital Services Quality' },
      { domain: 'D7', sort: 2, name_ar: 'القنوات والخدمات الرقمية',       name_en: 'Digital Channels and Services' },
      // D8 – مركزية المستفيد
      { domain: 'D8', sort: 1, name_ar: 'مشاركة المستفيد',               name_en: 'Beneficiary Participation' },
      { domain: 'D8', sort: 2, name_ar: 'تعزيز العلاقة مع المستفيد',      name_en: 'Enhancing Beneficiary Relationship' },
      { domain: 'D8', sort: 3, name_ar: 'تجربة المستفيد',                 name_en: 'Beneficiary Experience' },
      // D9 – البيانات الحكومية
      { domain: 'D9', sort: 1, name_ar: 'حوكمة وإدارة البيانات',          name_en: 'Data Governance and Management' },
      { domain: 'D9', sort: 2, name_ar: 'استخدام وإتاحة البيانات',        name_en: 'Data Use and Accessibility' },
      { domain: 'D9', sort: 3, name_ar: 'البيانات المفتوحة',              name_en: 'Open Data' },
      // D10 – البحث والابتكار
      { domain: 'D10', sort: 1, name_ar: 'الابتكار المؤسسي',             name_en: 'Institutional Innovation' },
      { domain: 'D10', sort: 2, name_ar: 'الحلول الابتكارية',             name_en: 'Innovative Solutions' },
    ];

    // ── Step 4: Generate codes and insert ───────────────────────────────────
    console.log('Inserting axes...\n');
    let globalIdx = 1;

    for (const ax of axes) {
      const perspectiveId = domainMap[ax.domain];
      if (!perspectiveId) {
        throw new Error(`Domain ${ax.domain} not found in perspectives table!`);
      }

      // Code format: D1-A1, D1-A2, D2-A1 ...
      const code = `${ax.domain}-A${ax.sort}`;

      const res = await client.query(`
        INSERT INTO axes (perspective_id, code, name_en, name_ar, weight, sort_order, status)
        VALUES ($1, $2, $3, $4, 0, $5, 'active')
        RETURNING id, code, name_ar
      `, [perspectiveId, code, ax.name_en, ax.name_ar, globalIdx]);

      const row = res.rows[0];
      console.log(`  ${globalIdx.toString().padStart(2)}. ${row.code.padEnd(8)} │ ${row.name_ar}`);
      globalIdx++;
    }

    await client.query('COMMIT');
    console.log(`\n✅ ${axes.length} axes inserted successfully across 10 domains.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedAxes();
