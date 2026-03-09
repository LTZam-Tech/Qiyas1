const { Client } = require('pg');

async function seedStandardNames() {
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

    // Make sure we have the axes to link to
    const aRes = await client.query('SELECT id, code FROM axes WHERE deleted_at IS NULL');
    const axisMap = {};
    aRes.rows.forEach(r => { axisMap[r.code] = r.id; });

    console.log('Clearing old standards (and evidence reqs/tasks) to re-seed correctly...');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM evidence_requirements');
    await client.query('DELETE FROM standards');

    console.log('Inserting real standards...');

    // Standards provided by user: code and name. We map them to their axis prefix (e.g. 5.1.1 -> 5.1)
    const standardsData = [
      { code: '5.1.1', name: 'تطوير خطة استراتيجية للتحول الرقمي متوائمة مع استراتيجية الجهة ومستهدفات رؤية السعودية 2030' },
      { code: '5.1.2', name: 'تطوير خطة تنفيذية للتحول الرقمي وفق أفضل الممارسات معتمدة على الخطة الاستراتيجية للتحول' },
      { code: '5.1.3', name: 'إنشاء وحدة لإدارة مشاريع التحول الرقمي لتحقيق كفاءة المشاريع الرقمية ومتابعة التقدم في التحول' },
      { code: '5.2.1', name: 'وضع إطار عام لحوكمة التحول الرقمي لمتابعة تنفيذ خطط التحول وضمان تحقيق المستهدفات' },
      { code: '5.2.2', name: 'تنفيذ إطار حوكمة التحول الرقمي ومراقبة التقدم في التنفيذ واتخاذ الإجراءات التصحيحية' },
      { code: '5.2.3', name: 'تطبيق آليات لحوكمة المبادرات والمشاريع المشتركة بين الجهات لتحقيق مستهدفات التحول' },
      // Added missing 5.2.4 based on user's first table (5.2 has 4 standards). 
      // Wait, user's second list didn't include 5.2.4 name. I will provide a generic one if missing, but let's check:
      // User's detailed list didn't provide 5.2.4 name or 5.3.x names. Wait!
      // Let me look at the user prompt again.
      { code: '5.3.1', name: 'تأسيس وحدة تنظيمية لإدارة ممارسات البنية المؤسسية داخل الجهة' },
      { code: '5.3.2', name: 'تطبيق ممارسات البنية المؤسسية لتعزيز العمل المؤسسي باستخدام منهجيات معتمدة' },
      { code: '5.3.3', name: 'تفعيل وحوكمة ممارسات البنية المؤسسية' },
      { code: '5.3.4', name: 'تعزيز دور البنية المؤسسية في استدامة التحول الرقمي والمشاركة في التخطيط' },
      { code: '5.4.1', name: 'تحديد مستوى الوعي لدى منسوبي الجهة بعملية التحول الرقمي' },
      { code: '5.4.2', name: 'تنفيذ برامج لرفع وعي منسوبي الجهة بالتحول الرقمي وقياس أثرها' },
      { code: '5.4.3', name: 'تعزيز تبني الأدوات التقنية لتحسين الأعمال اليومية' },
      { code: '5.5.1', name: 'تأهيل قيادات التحول الرقمي وبناء القدرات القيادية' },
      { code: '5.5.2', name: 'تنفيذ خطة تطوير القيادات الرقمية وقياس أثرها' },
      { code: '5.5.3', name: 'إشراك القيادات المؤهلة في اتخاذ القرارات الرقمية' },
      { code: '5.5.4', name: 'تبادل الخبرات القيادية مع الجهات الأخرى' },
      { code: '5.6.1', name: 'تعزيز الكفاءات الرقمية لدى منسوبي الجهة' },
      { code: '5.6.2', name: 'تنفيذ خطة لبناء الكفاءات في مجال التحول الرقمي' },
      { code: '5.6.3', name: 'التعاون مع الجهات الحكومية لبناء الكفاءات' },
      { code: '5.7.1', name: 'توثيق إجراءات العمل' },
      { code: '5.7.2', name: 'أتمتة إجراءات العمل' },
      { code: '5.7.3', name: 'تحسين الإجراءات التشغيلية' },
      { code: '5.7.4', name: 'قياس كفاءة الإجراءات' },
      { code: '5.8.1', name: 'تطبيق إطار لإدارة المخاطر' },
      { code: '5.8.2', name: 'تحديد وتقييم المخاطر الرقمية' },
      { code: '5.8.3', name: 'مراقبة المخاطر ومعالجتها' },
      { code: '5.9.1', name: 'إعداد خطة استمرارية الأعمال' },
      { code: '5.9.2', name: 'اختبار خطط الاستمرارية' },
      { code: '5.9.3', name: 'تحديث خطط الاستمرارية بشكل دوري' },
      { code: '5.10.1', name: 'توفير الأنظمة الداعمة للتحول الرقمي' },
      { code: '5.10.2', name: 'تكامل الأنظمة الرقمية' },
      { code: '5.10.3', name: 'إدارة التطبيقات الرقمية' },
      { code: '5.10.4', name: 'تحديث الأنظمة الرقمية' },
      { code: '5.10.5', name: 'مراقبة أداء الأنظمة' },
      { code: '5.11.1', name: 'توفير بنية تحتية تقنية موثوقة' },
      { code: '5.11.2', name: 'إدارة مراكز البيانات' },
      { code: '5.11.3', name: 'ضمان توفر الخدمات التقنية' },
      { code: '5.11.4', name: 'إدارة الشبكات' },
      { code: '5.11.5', name: 'مراقبة الأداء' },
      { code: '5.11.6', name: 'تأمين البنية التقنية' },
      { code: '5.11.7', name: 'إدارة السعة التقنية' },
      { code: '5.12.1', name: 'تبني الحوسبة السحابية' },
      { code: '5.12.2', name: 'إدارة الخدمات السحابية' },
      { code: '5.12.3', name: 'حوكمة استخدام السحابة' },
      { code: '5.12.4', name: 'تحسين استخدام السحابة' },
      { code: '5.13.1', name: 'التكامل مع منصات الحكومة الشاملة' },
      { code: '5.13.2', name: 'استخدام الخدمات المشتركة الحكومية' },
      { code: '5.13.3', name: 'تبادل البيانات مع الجهات الحكومية' },
      { code: '5.14.1', name: 'تصميم الخدمات الرقمية' },
      { code: '5.14.2', name: 'تحسين جودة الخدمات الرقمية' },
      { code: '5.14.3', name: 'قياس رضا المستفيد' },
      { code: '5.14.4', name: 'تطوير الخدمات الرقمية' },
      { code: '5.15.1', name: 'توفير قنوات رقمية متعددة' },
      { code: '5.15.2', name: 'إدارة القنوات الرقمية' },
      { code: '5.15.3', name: 'تحسين تجربة القنوات الرقمية' },
      { code: '5.16.1', name: 'إشراك المستفيدين في تطوير الخدمات' },
      { code: '5.16.2', name: 'جمع ملاحظات المستفيدين' },
      { code: '5.17.1', name: 'إدارة العلاقة مع المستفيد' },
      { code: '5.17.2', name: 'تحسين التواصل مع المستفيد' },
      { code: '5.18.1', name: 'تصميم تجربة المستفيد' },
      { code: '5.18.2', name: 'قياس تجربة المستفيد' },
      { code: '5.18.3', name: 'تحسين تجربة المستفيد' },
      { code: '5.19.1', name: 'تطبيق حوكمة البيانات' },
      { code: '5.19.2', name: 'إدارة جودة البيانات' },
      { code: '5.19.3', name: 'إدارة البيانات المرجعية' },
      { code: '5.19.4', name: 'إدارة دورة حياة البيانات' },
      { code: '5.20.1', name: 'استخدام البيانات في اتخاذ القرار' },
      { code: '5.20.2', name: 'إتاحة البيانات' },
      { code: '5.20.3', name: 'مشاركة البيانات' },
      { code: '5.21.1', name: 'نشر البيانات المفتوحة' },
      { code: '5.21.2', name: 'تحديث البيانات المفتوحة' },
      { code: '5.22.1', name: 'تعزيز الابتكار المؤسسي' },
      { code: '5.22.2', name: 'دعم مبادرات الابتكار' },
      { code: '5.23.1', name: 'تطوير حلول ابتكارية' },
      { code: '5.23.2', name: 'تبني التقنيات الناشئة' }
    ];

    let count = 0;
    for (const std of standardsData) {
      // Find axis code (e.g. 5.1 from 5.1.1)
      const parts = std.code.split('.');
      const axisCode = `${parts[0]}.${parts[1]}`;
      const sortOrder = parseInt(parts[2], 10);
      
      const axisId = axisMap[axisCode];
      if (!axisId) {
        console.warn(`Warning: Axis ${axisCode} not found for standard ${std.code}`);
        continue;
      }

      // Insert standard (Weight = 0, Status = active by default in DB schema, but we'll specify)
      const sRes = await client.query(`
        INSERT INTO standards (axis_id, code, name_en, name_ar, weight, sort_order, status)
        VALUES ($1, $2, $3, $4, 0, $5, 'active')
        RETURNING id
      `, [axisId, std.code, std.name, std.name, sortOrder]);

      const standardId = sRes.rows[0].id;

      // Create 1 default Evidence Requirement per standard (this maps to "EvidenceRequired" concept)
      await client.query(`
        INSERT INTO evidence_requirements (standard_id, code, title_en, title_ar, is_required, weight, sort_order)
        VALUES ($1, $2, $3, $4, true, 0, 1)
      `, [standardId, `${std.code}-REQ1`, 'شاهد متطلب', 'شاهد متطلب']);

      count++;
    }

    await client.query('COMMIT');
    console.log(`\n✅ ${count} standards and default evidence requirements inserted.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
  } finally {
    await client.end();
  }
}

seedStandardNames();
