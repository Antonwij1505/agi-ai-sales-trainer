import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { z } from 'zod';

export const employeeInputSchema = z.object({
  employee_code: z.string().min(1, 'Employee code required'),
  name: z.string().min(1, 'Name required'),
  position: z.string().optional(),
  department: z.string().optional(),
  supervisor: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  join_date: z.string().optional(),
  user_id: z.number().int().optional(),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export async function listEmployees(query: { search?: string; status?: string; limit?: number; offset?: number }) {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  let sql = 'SELECT * FROM trainer_employees WHERE 1=1';
  const params: unknown[] = [];
  let paramIdx = 1;

  if (query.search) {
    sql += ` AND (name ILIKE $${paramIdx} OR employee_code ILIKE $${paramIdx} OR position ILIKE $${paramIdx})`;
    params.push(`%${query.search}%`);
    paramIdx++;
  }

  if (query.status) {
    sql += ` AND status = $${paramIdx}`;
    params.push(query.status);
    paramIdx++;
  }

  sql += ` ORDER BY id DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);

  const { rows } = await pool.query(sql, params);
  const countRes = await pool.query('SELECT COUNT(*) FROM trainer_employees');
  const total = Number(countRes.rows[0].count);

  return {
    data: rows,
    pagination: {
      total,
      limit,
      offset,
    },
  };
}

export async function createEmployee(input: EmployeeInput) {
  const { rows } = await pool.query(
    `INSERT INTO trainer_employees (employee_code, name, position, department, supervisor, status, join_date, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.employee_code,
      input.name,
      input.position ?? null,
      input.department ?? null,
      input.supervisor ?? null,
      input.status ?? 'active',
      input.join_date ?? null,
      input.user_id ?? null,
    ]
  );
  return rows[0];
}

export async function updateEmployee(id: number, input: Partial<EmployeeInput>) {
  const existing = await pool.query('SELECT * FROM trainer_employees WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw new HttpError(404, 'Employee not found');

  const curr = existing.rows[0];
  const { rows } = await pool.query(
    `UPDATE trainer_employees
     SET employee_code = COALESCE($1, employee_code),
         name = COALESCE($2, name),
         position = COALESCE($3, position),
         department = COALESCE($4, department),
         supervisor = COALESCE($5, supervisor),
         status = COALESCE($6, status),
         join_date = COALESCE($7, join_date),
         user_id = COALESCE($8, user_id),
         updated_at = now()
     WHERE id = $9
     RETURNING *`,
    [
      input.employee_code ?? curr.employee_code,
      input.name ?? curr.name,
      input.position ?? curr.position,
      input.department ?? curr.department,
      input.supervisor ?? curr.supervisor,
      input.status ?? curr.status,
      input.join_date ?? curr.join_date,
      input.user_id ?? curr.user_id,
      id,
    ]
  );
  return rows[0];
}

export async function deactivateEmployee(id: number) {
  const { rows } = await pool.query(
    `UPDATE trainer_employees SET status = 'inactive', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'Employee not found');
  return rows[0];
}
