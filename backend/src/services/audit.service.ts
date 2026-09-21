import { pool } from '../db/pool.js';

export interface AuditLogInput {
  userId?: number | null;
  username?: string | null;
  action: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'ai_action' | 'permission_sensitive';
  entity?: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Record an audit log entry in trainer_audit_logs.
 */
export async function recordAudit(input: AuditLogInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO trainer_audit_logs (user_id, username, action, entity, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId ?? null,
        input.username ?? null,
        input.action,
        input.entity ?? null,
        input.entityId != null ? String(input.entityId) : null,
        JSON.stringify(input.details ?? {}),
        input.ipAddress ?? null,
      ]
    );
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
