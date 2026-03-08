const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function seedUsers() {
  const client = new Client({
    user: 'QiyasUser',
    host: '127.0.0.1',
    database: 'Qiyas',
    password: 'Test123456',
    port: 5432
  });

  try {
    await client.connect();

    // 1. Fetch available Roles
    const rolesRes = await client.query('SELECT id, name FROM roles');
    const roles = {};
    rolesRes.rows.forEach(r => { roles[r.name] = r.id; });

    if (!roles['admin'] || !roles['dean'] || !roles['consultant'] || !roles['employee']) {
      throw new Error("Missing roles! Did you run 0002_seed_rbac.sql?");
    }

    // 2. Define Demo Users
    const demoUsers = [
      { name: 'System Admin', email: 'admin@university.edu', password: 'AdminPass123', role: 'admin' },
      { name: 'Dr. Dean', email: 'dean@university.edu', password: 'DeanPass123', role: 'dean' },
      { name: 'External Consultant', email: 'consultant@qiyas.sa', password: 'ConsultPass123', role: 'consultant' },
      { name: 'John Doe Employee', email: 'employee@test.com', password: 'UserPass123', role: 'employee' }
    ];

    console.log('Seeding fake users into users table...');

    for (const u of demoUsers) {
      const hash = await bcrypt.hash(u.password, 10);
      
      const insertUserRes = await client.query(`
        INSERT INTO users (name, email, password_hash, is_active) 
        VALUES ($1, $2, $3, true)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id
      `, [u.name, u.email, hash]);
      
      const userId = insertUserRes.rows[0].id;
      
      await client.query(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING
      `, [userId, roles[u.role]]);
    }

    console.log('SUCCESS: Default demo users and mapped roles have been restored.');

  } catch (err) {
    console.error('User seed failed:', err.message);
  } finally {
    await client.end();
  }
}

seedUsers();
