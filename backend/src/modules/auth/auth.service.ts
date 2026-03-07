import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import db from '@/db';
// import redis from '@/db/redis'; // Reserved for future caching
import config from '@/config';
import { UnauthorizedError, ConflictError, BusinessLogicError } from '@/utils/errors';
import logger from '@/utils/logger';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

class AuthService {
  // Generate access token (JWT, 15 minutes)
  generateAccessToken(userId: string, role: string): string {
    return jwt.sign(
      { userId, role },
      config.jwt.accessSecret,
      { expiresIn: '15m', algorithm: 'HS256' }
    );
  }

  // Generate refresh token (random, 30 days)
  async generateRefreshToken(userId: string): Promise<string> {
    const refreshToken = randomBytes(32).toString('hex');
    // Use SHA-256 for storage to allow efficient DB lookup.
    // bcrypt is not needed here because the refresh token is already a
    // cryptographically random 32-byte value (256 bits of entropy), which
    // makes brute-force attacks infeasible regardless of hash speed.
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Store in database
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );

    return refreshToken;
  }

  // Login with email and password
  async login(email: string, password: string, ipAddress: string): Promise<{ user: any; tokens: TokenPair }> {
    const result = await db.query(
      `SELECT 
        u.id, u.email, u.password_hash, u.name as user_name, u.name_ar, u.is_active, 
        u.failed_login_attempts, u.locked_until,
        r.name as role
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const user = {
      ...result.rows[0],
      name: result.rows[0].user_name
    };

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new BusinessLogicError(
        `Account is locked. Try again in ${remainingMinutes} minutes`,
        'ACCOUNT_LOCKED'
      );
    }

    // Check account status
    if (!user.is_active) {
      throw new UnauthorizedError('Account is not active');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed login attempts
      await this.handleFailedLogin(user.id);
      throw new UnauthorizedError('Invalid credentials');
    }

    // Reset failed login attempts on successful login
    await db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    // Generate tokens
    const accessToken = this.generateAccessToken(user.id, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) 
       VALUES ($1, 'login', 'user', $1, $2)`,
      [user.id, JSON.stringify({ ip_address: ipAddress })]
    );

    logger.info('User logged in', { userId: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        name: user.name,
        nameAr: user.name_ar,
        role: user.role,
      },
      tokens: { accessToken, refreshToken },
    };
  }

  // Handle failed login attempts
  private async handleFailedLogin(userId: string): Promise<void> {
    const result = await db.query(
      `UPDATE users 
       SET failed_login_attempts = failed_login_attempts + 1 
       WHERE id = $1 
       RETURNING failed_login_attempts`,
      [userId]
    );

    const attempts = result.rows[0].failed_login_attempts;

    // Lock account after max attempts
    if (attempts >= config.security.maxLoginAttempts) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + config.security.lockoutDurationMinutes);

      await db.query(
        `UPDATE users SET locked_until = $1 WHERE id = $2`,
        [lockUntil, userId]
      );

      logger.warn('Account locked due to failed login attempts', { userId, attempts });
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Hash the provided token for DB lookup
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const result = await db.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.is_active, r.name as role
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND rt.revoked_at IS NULL`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokenData = result.rows[0];

    // Check user status
    if (!tokenData.is_active) {
      throw new UnauthorizedError('Account is not active');
    }

    // Revoke old refresh token (rotation)
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
      [tokenData.id]
    );

    // Generate new tokens
    const newAccessToken = this.generateAccessToken(tokenData.user_id, tokenData.role);
    const newRefreshToken = await this.generateRefreshToken(tokenData.user_id);

    logger.debug('Access token refreshed', { userId: tokenData.user_id });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // Logout (revoke refresh token)
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );
  }

  // Register new user (admin only)
  async register(data: {
    email: string;
    password: string;
    fullName: string;
    roleId: number;
    departmentId?: number;
  }): Promise<any> {
    // Check if email exists
    const existingUser = await db.query(
      `SELECT id FROM users WHERE email = $1`,
      [data.email]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, config.security.bcryptRounds);

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, department_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, email, full_name, created_at`,
      [data.email, passwordHash, data.fullName, data.roleId, data.departmentId || null]
    );

    const user = result.rows[0];

    // Log audit event
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id) 
       VALUES ($1, 'create_user', 'user', $1)`,
      [user.id]
    );

    logger.info('User registered', { userId: user.id, email: user.email });

    return user;
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Fetch user
    const result = await db.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    const user = result.rows[0];

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newPasswordHash, userId]
    );

    // Revoke all refresh tokens for security
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    logger.info('Password changed', { userId });
  }

  // Get current user profile
  async getCurrentUser(userId: string): Promise<any> {
    const result = await db.query(
      `SELECT 
        u.id, u.email, u.name as user_name, u.name_ar, u.phone, u.department, 
        u.job_title, u.avatar_url, u.is_active, u.last_login,
        r.name as role,
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
       GROUP BY u.id, u.email, u.name, u.name_ar, u.phone, u.department, u.job_title, u.avatar_url, u.is_active, u.last_login, r.name`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    const user = result.rows[0];

    return {
      id: user.id,
      email: user.email,
      fullName: user.user_name,
      name: user.user_name,
      nameAr: user.name_ar,
      phone: user.phone,
      department: user.department,
      jobTitle: user.job_title,
      avatarUrl: user.avatar_url,
      role: user.role,
      isActive: user.is_active,
      lastLogin: user.last_login,
      permissions: user.permissions || [],
    };
  }
}

export default new AuthService();
