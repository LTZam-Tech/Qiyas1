import { BaseRepository } from '@/db/repository';
import db from '@/db';
import bcrypt from 'bcrypt';
import config from '@/config';
import { NotFoundError, ConflictError } from '@/utils/errors';

interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

interface CreateUserDto {
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  departmentId?: string;
}

export interface UpdateUserDto {
  fullName?: string;
  roleId?: string;
  departmentId?: string | null;
  status?: string;
}

class UsersService extends BaseRepository<User> {
  constructor() {
    super('users');
  }

  async getAllUsers(filters?: { role?: string; department?: string; status?: string }) {
    let query = `
      SELECT 
        u.id,
        u.email,
        u.name,
        u.is_active,
        CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END as status,
        u.last_login,
        u.created_at,
        string_agg(DISTINCT r.name, ', ') as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE 1=1 AND u.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.role) {
      query += ` AND r.name = $${paramIndex}`;
      params.push(filters.role);
      paramIndex++;
    }

    if (filters?.status) {
      const statusFilter = String(filters.status).toLowerCase();
      if (statusFilter === 'active') {
        query += ` AND u.is_active = TRUE`;
      } else if (statusFilter === 'inactive' || statusFilter === 'suspended') {
        query += ` AND u.is_active = FALSE`;
      }
      paramIndex++;
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getUserById(userId: string) {
    const result = await db.query(
      `SELECT 
        u.id,
        u.email,
        u.name,
        u.is_active,
        CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END as status,
        u.last_login,
        u.created_at,
        u.updated_at,
        string_agg(DISTINCT r.id, ',') as role_ids,
        string_agg(DISTINCT r.name, ', ') as role,
        COALESCE(
          json_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL),
          '[]'
        ) as permissions
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       LEFT JOIN role_permissions rp ON r.id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE u.id = $1 AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    return result.rows[0];
  }

  async createUser(data: CreateUserDto, createdBy: string) {
    // Check if email exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [data.email]);
    if (existing.rows.length > 0) {
      throw new ConflictError('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, config.security.bcryptRounds);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, email, name, is_active, created_at`,
      [data.email, passwordHash, data.fullName]
    );

    const user = result.rows[0];

    // Assign role if provided
    if (data.roleId) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [user.id, data.roleId]
      );
    }

    // Audit log
    await this.logAudit(createdBy, 'create_user', 'user', user.id, { email: user.email });

    return user;
  }

  async updateUser(userId: string, data: UpdateUserDto, updatedBy: string) {
    const user = await this.getUserById(userId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.fullName) {
      updates.push(`name = $${paramIndex}`);
      values.push(data.fullName);
      paramIndex++;
    }

    if (data.status) {
      const isActive = data.status === 'active';
      updates.push(`is_active = $${paramIndex}`);
      values.push(isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      return user;
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Audit log
    await this.logAudit(updatedBy, 'update_user', 'user', userId, data);

    return result.rows[0];
  }

  async deleteUser(userId: string, deletedBy: string) {
    await this.getUserById(userId); // Check exists

    await db.query('UPDATE users SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);

    // Audit log
    await this.logAudit(deletedBy, 'delete_user', 'user', userId, {});

    return true;
  }

  async assignRole(userId: string, roleId: string, assignedBy: string) {
    await this.getUserById(userId); // Check exists

    // First delete any existing roles
    await db.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

    // Then assign the new role
    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);

    // Audit log
    await this.logAudit(assignedBy, 'assign_role', 'user', userId, { role_id: roleId });

    return true;
  }
}

export default new UsersService();
