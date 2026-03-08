/**
 * seed_users.js — Seeds the 4 real system users
 *
 * Users: admin, dean, consultant, employee
 * This is idempotent (safe to run multiple times via ON CONFLICT).
 */
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

    // 2. Define the 4 real system users
    const systemUsers = [
      { name: 'System Admin',       email: 'admin@university.edu', password: 'AdminPass123',   role: 'admin' },
      { name: 'Dr. Dean',           email: 'dean@university.edu',  password: 'DeanPass123',    role: 'dean' },
      { name: 'External Consultant',email: 'consultant@qiyas.sa',  password: 'ConsultPass123', role: 'consultant' },
      { name: 'Employee',           email: 'employee@test.com',    password: 'UserPass123',    role: 'employee' }
    ];

    console.log('Seeding system users into users table...');

    for (const u of systemUsers) {
      const hash = await bcrypt.hash(u.password, 12);
      
      const insertUserRes = await client.query(`
        INSERT INTO users (name, email, password_hash, is_active) 
        VALUES ($1, $2, $3, true)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
        RETURNING id
      `, [u.name, u.email, hash]);
      
      const userId = insertUserRes.rows[0].id;
      
      await client.query(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING
      `, [userId, roles[u.role]]);

      console.log(`  ✓ ${u.role}: ${u.email}`);
    }

    console.log('\nSUCCESS: System users seeded. No mock hierarchy data was inserted.');

  } catch (err) {
    console.error('User seed failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedUsers();
