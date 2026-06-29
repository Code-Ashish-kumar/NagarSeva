/**
 * db/seed-admin.js
 *
 * Creates a department ADMIN + FIELD_WORKER for testing.
 * Run: node db/seed-admin.js
 *
 * Admin:
 *   Email:    admin@nagarseva.in
 *   Password: Admin@123
 *   Dept:     Road & Infrastructure (id=1)
 *
 * Field Worker:
 *   Email:    worker@nagarseva.in
 *   Password: Worker@123
 *   Dept:     Road & Infrastructure (id=1)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('../src/config/db');

async function seed() {
  try {
    // Get first department ID
    const deptResult = await pool.query('SELECT id FROM departments ORDER BY id LIMIT 1');
    if (deptResult.rows.length === 0) {
      console.error('❌ No departments found. Run migration 008 first.');
      process.exit(1);
    }
    const dept_id = deptResult.rows[0].id;

    // Seed Admin
    const adminEmail = 'admin@nagarseva.in';
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('Admin@123', 12);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_verified, department_id)
         VALUES ($1, $2, $3, 'ADMIN', TRUE, $4)`,
        ['Department Admin', adminEmail, hash, dept_id]
      );
      console.log(`✅ Admin created: ${adminEmail} / Admin@123 (dept_id=${dept_id})`);
    } else {
      console.log(`✅ Admin already exists: ${adminEmail}`);
    }

    // Seed Field Worker
    const workerEmail = 'worker@nagarseva.in';
    const existing2 = await pool.query('SELECT id FROM users WHERE email = $1', [workerEmail]);
    if (existing2.rows.length === 0) {
      const hash = await bcrypt.hash('Worker@123', 12);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, is_verified, department_id)
         VALUES ($1, $2, $3, 'FIELD_WORKER', TRUE, $4)`,
        ['Ravi Kumar', workerEmail, hash, dept_id]
      );
      console.log(`✅ Field Worker created: ${workerEmail} / Worker@123 (dept_id=${dept_id})`);
    } else {
      console.log(`✅ Field Worker already exists: ${workerEmail}`);
    }

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
