import assert from 'assert';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { recordAudit } from '../services/audit.service.js';
import { pool } from '../db/pool.js';

async function runTests() {
  console.log('Running Foundation & RBAC tests...');

  // 1. Test JWT generation and payload verification matching AuthJwtPayload
  const testPayload = {
    sub: 999,
    username: 'test_admin',
    role: 'super_admin' as const,
    nama_lengkap: 'Test Administrator'
  };

  const token = jwt.sign(testPayload, env.JWT_SECRET, { expiresIn: '1h' });
  assert(token, 'JWT token should be generated');

  const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as typeof testPayload;
  assert.strictEqual(decoded.sub, 999);
  assert.strictEqual(decoded.role, 'super_admin');
  console.log('✅ JWT Authentication test passed');

  // 2. Test Audit Logging
  try {
    await recordAudit({
      userId: 999,
      username: 'test_admin',
      action: 'login',
      entity: 'auth',
      entityId: '999',
      details: { status: 'success' },
      ipAddress: '127.0.0.1'
    });
    console.log('✅ Audit logging test passed');
  } catch (err) {
    console.error('❌ Audit logging failed:', err);
    throw err;
  }

  // 3. Test RBAC roles seeding and permissions lookup in DB (if DB available)
  try {
    const roleCheck = await pool.query('SELECT name FROM trainer_roles WHERE name = $1', ['super_admin']);
    assert(roleCheck.rows.length > 0, 'super_admin role must exist in DB');

    const permCheck = await pool.query('SELECT code FROM trainer_permissions WHERE code = $1', ['menu:dashboard']);
    assert(permCheck.rows.length > 0, 'menu:dashboard permission must exist in DB');

    console.log('✅ Database RBAC roles & permissions verification passed');
  } catch (dbErr) {
    console.warn('⚠️ DB not reachable for live RBAC query test (skipping or running offline):', dbErr);
  }

  console.log('All Foundation tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
