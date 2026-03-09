const { Client } = require('pg');

async function translateStandards() {
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

    const englishTranslations = {
      '5.1.1': 'Develop a digital transformation strategic plan aligned with the entity strategy and Vision 2030 targets',
      '5.1.2': 'Develop an executive plan for digital transformation according to best practices based on the strategic plan',
      '5.1.3': 'Establish a digital transformation project management unit to achieve digital project efficiency and monitor progress',
      '5.2.1': 'Establish a general framework for digital transformation governance to monitor plan execution and ensure targets are met',
      '5.2.2': 'Implement the digital transformation governance framework, monitor execution progress, and take corrective actions',
      '5.2.3': 'Apply mechanisms to govern joint initiatives and projects between entities to achieve transformation targets',
      '5.3.1': 'Establish an organizational unit to manage enterprise architecture practices within the entity',
      '5.3.2': 'Apply enterprise architecture practices to enhance institutional work using approved methodologies',
      '5.3.3': 'Activate and govern enterprise architecture practices',
      '5.3.4': 'Enhance the role of enterprise architecture in sustaining digital transformation and participating in planning',
      '5.4.1': 'Determine the level of awareness among entity staff regarding the digital transformation process',
      '5.4.2': 'Implement programs to raise entity staff awareness of digital transformation and measure their impact',
      '5.4.3': 'Promote the adoption of technical tools to improve daily business operations',
      '5.5.1': 'Qualify digital transformation leaders and build leadership capabilities',
      '5.5.2': 'Implement a digital leadership development plan and measure its impact',
      '5.5.3': 'Engage qualified leaders in making digital decisions',
      '5.5.4': 'Exchange leadership experiences with other entities',
      '5.6.1': 'Enhance digital competencies among entity staff',
      '5.6.2': 'Implement a plan to build competencies in the field of digital transformation',
      '5.6.3': 'Collaborate with government entities to build competencies',
      '5.7.1': 'Document business procedures',
      '5.7.2': 'Automate business procedures',
      '5.7.3': 'Improve operational procedures',
      '5.7.4': 'Measure procedure efficiency',
      '5.8.1': 'Apply a risk management framework',
      '5.8.2': 'Identify and assess digital risks',
      '5.8.3': 'Monitor and mitigate risks',
      '5.9.1': 'Prepare a business continuity plan',
      '5.9.2': 'Test continuity plans',
      '5.9.3': 'Update continuity plans periodically',
      '5.10.1': 'Provide systems supporting digital transformation',
      '5.10.2': 'Integrate digital systems',
      '5.10.3': 'Manage digital applications',
      '5.10.4': 'Update digital systems',
      '5.10.5': 'Monitor system performance',
      '5.11.1': 'Provide a reliable technical infrastructure',
      '5.11.2': 'Manage data centers',
      '5.11.3': 'Ensure availability of technical services',
      '5.11.4': 'Manage networks',
      '5.11.5': 'Monitor performance',
      '5.11.6': 'Secure technical infrastructure',
      '5.11.7': 'Manage technical capacity',
      '5.12.1': 'Adopt cloud computing',
      '5.12.2': 'Manage cloud services',
      '5.12.3': 'Govern cloud usage',
      '5.12.4': 'Optimize cloud usage',
      '5.13.1': 'Integrate with comprehensive government platforms',
      '5.13.2': 'Utilize shared government services',
      '5.13.3': 'Exchange data with government entities',
      '5.14.1': 'Design digital services',
      '5.14.2': 'Improve digital services quality',
      '5.14.3': 'Measure beneficiary satisfaction',
      '5.14.4': 'Develop digital services',
      '5.15.1': 'Provide multiple digital channels',
      '5.15.2': 'Manage digital channels',
      '5.15.3': 'Improve digital channel experience',
      '5.16.1': 'Engage beneficiaries in service development',
      '5.16.2': 'Collect beneficiary feedback',
      '5.17.1': 'Manage relationship with beneficiary',
      '5.17.2': 'Improve communication with beneficiary',
      '5.18.1': 'Design beneficiary experience',
      '5.18.2': 'Measure beneficiary experience',
      '5.18.3': 'Improve beneficiary experience',
      '5.19.1': 'Apply data governance',
      '5.19.2': 'Manage data quality',
      '5.19.3': 'Manage reference data',
      '5.19.4': 'Manage data lifecycle',
      '5.20.1': 'Use data in decision making',
      '5.20.2': 'Make data accessible',
      '5.20.3': 'Share data',
      '5.21.1': 'Publish open data',
      '5.21.2': 'Update open data',
      '5.22.1': 'Promote institutional innovation',
      '5.22.2': 'Support innovation initiatives',
      '5.23.1': 'Develop innovative solutions',
      '5.23.2': 'Adopt emerging technologies'
    };

    console.log('Translating standards to English...');
    let count = 0;

    for (const [code, nameEn] of Object.entries(englishTranslations)) {
      const res = await client.query(
        'UPDATE standards SET name_en = $1 WHERE code = $2 RETURNING id',
        [nameEn, code]
      );
      if (res.rowCount > 0) {
        count++;
      } else {
        console.warn(`Standard ${code} not found!`);
      }
    }

    // Also update evidence requirements titles to english where standard code matches
    for (const [code, nameEn] of Object.entries(englishTranslations)) {
      await client.query(
        `UPDATE evidence_requirements 
         SET title_en = $1 
         WHERE code = $2`,
        [nameEn, `${code}-REQ1`]
      );
    }

    await client.query('COMMIT');
    console.log(`\n✅ ${count} standards correctly translated to English.`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
  } finally {
    await client.end();
  }
}

translateStandards();
