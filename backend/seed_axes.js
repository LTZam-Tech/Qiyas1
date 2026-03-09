const { Client } = require('pg');

async function seedAxisAndStandards() {
  const client = new Client({
    user: 'QiyasUser', host: '127.0.0.1', database: 'Qiyas',
    password: 'Test123456', port: 5432
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    // ── Step 1: Clear all dependent data ──────────────────────────────────
    console.log('Clearing old data...');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM evidence_requirements');
    await client.query('DELETE FROM standards');
    await client.query('DELETE FROM axes');
    console.log('  ✓ Cleared\n');

    // ── Step 2: Load domain map by Arabic name ─────────────────────────────
    const pRes = await client.query('SELECT id, name_ar FROM perspectives WHERE deleted_at IS NULL');
    const byName = {};
    pRes.rows.forEach(r => { byName[r.name_ar.trim()] = r.id; });

    // Helper – throws if domain not found
    const D = (name) => {
      const id = byName[name];
      if (!id) throw new Error(`Domain not found: "${name}"`);
      return id;
    };

    // ── Step 3: Define 23 axes ─────────────────────────────────────────────
    // Each entry: { domain_name_ar, code, name_ar, name_en, standards_count }
    const axes = [
      { d: 'الاستراتيجية والتخطيط',            code: '5.1',  sort: 1,  name_ar: 'التخطيط للتحول الرقمي',          name_en: 'Digital Transformation Planning',              stdCount: 3 },
      { d: 'الاستراتيجية والتخطيط',            code: '5.2',  sort: 2,  name_ar: 'حوكمة التحول الرقمي',             name_en: 'Digital Transformation Governance',            stdCount: 4 },
      { d: 'الاستراتيجية والتخطيط',            code: '5.3',  sort: 3,  name_ar: 'البنية المؤسسية',                  name_en: 'Institutional Architecture',                   stdCount: 4 },
      { d: 'المنظمة والثقافة',                 code: '5.4',  sort: 4,  name_ar: 'الثقافة والبيئة الرقمية',           name_en: 'Digital Culture and Environment',              stdCount: 3 },
      { d: 'المنظمة والثقافة',                 code: '5.5',  sort: 5,  name_ar: 'تطوير قيادات التحول الرقمي',       name_en: 'Digital Transformation Leadership Development', stdCount: 3 },
      { d: 'المنظمة والثقافة',                 code: '5.6',  sort: 6,  name_ar: 'بناء الكفاءات',                    name_en: 'Competency Building',                          stdCount: 3 },
      { d: 'العمليات والتشغيل',                code: '5.7',  sort: 7,  name_ar: 'إجراءات العمل',                    name_en: 'Work Procedures',                              stdCount: 4 },
      { d: 'إدارة المخاطر واستمرارية الأعمال', code: '5.8',  sort: 8,  name_ar: 'إدارة المخاطر',                    name_en: 'Risk Management',                              stdCount: 3 },
      { d: 'إدارة المخاطر واستمرارية الأعمال', code: '5.9',  sort: 9,  name_ar: 'استمرارية الأعمال',                name_en: 'Business Continuity',                          stdCount: 3 },
      { d: 'تقنية المعلومات',                  code: '5.10', sort: 10, name_ar: 'الأنظمة الداعمة للتحول الرقمي',   name_en: 'Systems Supporting Digital Transformation',     stdCount: 5 },
      { d: 'تقنية المعلومات',                  code: '5.11', sort: 11, name_ar: 'البنية التحتية للخدمات التقنية',   name_en: 'Technical Services Infrastructure',            stdCount: 7 },
      { d: 'تقنية المعلومات',                  code: '5.12', sort: 12, name_ar: 'البنية السحابية',                  name_en: 'Cloud Architecture',                           stdCount: 4 },
      { d: 'الحكومة الشاملة',                  code: '5.13', sort: 13, name_ar: 'منصات الحكومة الشاملة',            name_en: 'Comprehensive Government Platforms',           stdCount: 3 },
      { d: 'القنوات والخدمات',                 code: '5.14', sort: 14, name_ar: 'جودة الخدمات الرقمية',             name_en: 'Digital Services Quality',                     stdCount: 4 },
      { d: 'القنوات والخدمات',                 code: '5.15', sort: 15, name_ar: 'القنوات والخدمات الرقمية',         name_en: 'Digital Channels and Services',                stdCount: 3 },
      { d: 'مركزية المستفيد',                  code: '5.16', sort: 16, name_ar: 'مشاركة المستفيد',                  name_en: 'Beneficiary Participation',                    stdCount: 2 },
      { d: 'مركزية المستفيد',                  code: '5.17', sort: 17, name_ar: 'تعزيز العلاقة مع المستفيد',        name_en: 'Enhancing Beneficiary Relationship',           stdCount: 2 },
      { d: 'مركزية المستفيد',                  code: '5.18', sort: 18, name_ar: 'تجربة المستفيد',                   name_en: 'Beneficiary Experience',                       stdCount: 3 },
      { d: 'البيانات الحكومية',                code: '5.19', sort: 19, name_ar: 'حوكمة وإدارة البيانات',            name_en: 'Data Governance and Management',               stdCount: 4 },
      { d: 'البيانات الحكومية',                code: '5.20', sort: 20, name_ar: 'استخدام وإتاحة البيانات',          name_en: 'Data Use and Accessibility',                   stdCount: 3 },
      { d: 'البيانات الحكومية',                code: '5.21', sort: 21, name_ar: 'البيانات المفتوحة',                name_en: 'Open Data',                                    stdCount: 2 },
      { d: 'البحث والابتكار',                  code: '5.22', sort: 22, name_ar: 'الابتكار المؤسسي',                 name_en: 'Institutional Innovation',                     stdCount: 2 },
      { d: 'البحث والابتكار',                  code: '5.23', sort: 23, name_ar: 'الحلول الابتكارية',                name_en: 'Innovative Solutions',                         stdCount: 2 },
    ];

    let totalStds = 0;
    console.log('Inserting axes and standards...\n');

    for (const ax of axes) {
      const perspId = D(ax.d);

      // Insert axis
      const axRes = await client.query(`
        INSERT INTO axes (perspective_id, code, name_en, name_ar, weight, sort_order, status)
        VALUES ($1, $2, $3, $4, 0, $5, 'active')
        RETURNING id
      `, [perspId, ax.code, ax.name_en, ax.name_ar, ax.sort]);
      const axisId = axRes.rows[0].id;

      // Insert standards under this axis (code only – names to be added later)
      for (let i = 1; i <= ax.stdCount; i++) {
        const stdCode = `${ax.code}.${i}`;
        await client.query(`
          INSERT INTO standards (axis_id, code, name_en, name_ar, weight, sort_order, status)
          VALUES ($1, $2, $3, $3, 0, $4, 'active')
        `, [axisId, stdCode, stdCode, i]);  // name_ar = name_en = code until real names are provided
        totalStds++;
      }

      console.log(`  ${ax.code.padEnd(6)} │ ${ax.name_ar.padEnd(35)} │ ${ax.stdCount} standards`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ Done: ${axes.length} axes + ${totalStds} standards inserted.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedAxisAndStandards();
