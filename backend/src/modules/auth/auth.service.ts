import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import nodemailer from 'nodemailer';
import db from '@/db';
import config from '@/config';
import { AppError, UnauthorizedError, ConflictError } from '@/utils/errors';
import logger from '@/utils/logger';
import { Algorithm } from 'jsonwebtoken';
import { SignOptions } from 'jsonwebtoken';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** One response for every failed sign-in before the password is proven (C7). */
const INVALID_CREDENTIALS = 'Invalid credentials';

class AuthService {
  // Compared against when the email is unknown, so an unknown email costs the same bcrypt work as a
  // known one (C7). Computed once with the configured rounds; the random input is never stored.
  private readonly dummyHash: string = bcrypt.hashSync(randomBytes(16).toString('hex'), config.security.bcryptRounds);
  private readonly passwordChangeAttempts = new Map<string, number[]>();
  private static readonly PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;
  private static readonly PASSWORD_CHANGE_MAX_ATTEMPTS = 5;

  private getJwtSigningKey(): string {
    if (config.jwt.algorithm === 'RS256') {
      if (!config.jwt.accessPrivateKey) {
        throw new UnauthorizedError('JWT private key is not configured');
      }
      return config.jwt.accessPrivateKey;
    }

    return config.jwt.accessSecret;
  }

  private enforceChangePasswordRateLimit(userId: string): void {
    const now = Date.now();
    const windowStart = now - AuthService.PASSWORD_CHANGE_WINDOW_MS;
    const attempts = (this.passwordChangeAttempts.get(userId) || []).filter((t) => t > windowStart);

    if (attempts.length >= AuthService.PASSWORD_CHANGE_MAX_ATTEMPTS) {
      throw new UnauthorizedError('Too many password change attempts. Please try again later.');
    }

    attempts.push(now);
    this.passwordChangeAttempts.set(userId, attempts);
  }

  private clearPasswordChangeAttempts(userId: string): void {
    this.passwordChangeAttempts.delete(userId);
  }

  private async sendPasswordChangeNotification(email: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || 'no-reply@qiyas.local';

    if (!host || !port || !user || !pass) {
      logger.warn('SMTP not configured; skipping password-change email notification', { email });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Your Qiyas password was changed',
      text: 'Your account password was changed successfully. If this was not you, contact support immediately.',
    });
  }

  // Generate access token (JWT, 15 minutes)
  generateAccessToken(userId: string, role: string): string {
    const signOptions: SignOptions = {
      expiresIn: config.jwt.accessExpiresIn as SignOptions['expiresIn'],
      algorithm: config.jwt.algorithm as Algorithm,
    };

    return jwt.sign(
      { userId, role },
      this.getJwtSigningKey(),
      signOptions
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

    const row = result.rows[0];

    // Always verify the password first, against a dummy hash for an unknown email, so the response and
    // its timing do not depend on whether the account exists, is locked or is inactive (C7).
    const isPasswordValid = await bcrypt.compare(password, row?.password_hash ?? this.dummyHash);
    const isLocked = Boolean(row?.locked_until && new Date(row.locked_until) > new Date());

    if (!row || !isPasswordValid) {
      // Count only failures against an existing account outside an active lock, so attempts during a
      // lock never extend it (C6).
      if (row && !isLocked) await this.handleFailedLogin(row.id);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const user = {
      ...row,
      name: row.user_name
    };

    // Account state is reported only after a correct password (D-C7-2); a lock is a 401 (D-C7-3).
    if (isLocked) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new AppError(`Account is locked. Try again in ${remainingMinutes} minutes`, 401, 'ACCOUNT_LOCKED');
    }

    if (!user.is_active) {
      throw new AppError('Account is not active', 401, 'ACCOUNT_INACTIVE');
    }

    // Reset failed login attempts on successful login
    await db.query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
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

  // Handle failed login attempts (C6). One atomic update: a lock that has expired starts a fresh count
  // (D-C6-1), and reaching the threshold sets the lock and resets the counter. The caller never counts
  // attempts made during an active lock.
  private async handleFailedLogin(userId: string): Promise<void> {
    const result = await db.query(
      `UPDATE users SET
         failed_login_attempts = CASE
           WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END) >= $2 THEN 0
           WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1
           ELSE failed_login_attempts + 1
         END,
         locked_until = CASE
           WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END) >= $2
             THEN NOW() + make_interval(mins => $3::int)
           WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN NULL
           ELSE locked_until
         END
       WHERE id = $1 AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until <= NOW())
       RETURNING failed_login_attempts, locked_until`,
      [userId, config.security.maxLoginAttempts, config.security.lockoutDurationMinutes]
    );

    const row = result.rows[0];
    if (row?.locked_until) {
      logger.warn('Account locked due to failed login attempts', { userId, attempts: config.security.maxLoginAttempts });
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
       WHERE rt.token_hash = $1
         AND rt.expires_at > NOW()
         AND rt.revoked_at IS NULL
         AND u.deleted_at IS NULL`,
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
    roleId: string;
    departmentId?: number;
  }): Promise<any> {
    // Check if email exists
    const existingUser = await db.query(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [data.email]
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, config.security.bcryptRounds);

    // Create user using correct schema columns (name, not full_name)
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, is_active, department)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING id, email, name, created_at`,
      [data.email, passwordHash, data.fullName, data.departmentId ? String(data.departmentId) : null]
    );

    const user = result.rows[0];

    // Assign role through user_roles junction table
    await db.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [user.id, data.roleId]
    );

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
    this.enforceChangePasswordRateLimit(userId);

    // Fetch user
    const result = await db.query(
      `SELECT password_hash, email FROM users WHERE id = $1 AND deleted_at IS NULL`,
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
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
      [newPasswordHash, userId]
    );

    // Revoke all refresh tokens for security
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'change_password', 'user', $1, $2)`,
      [userId, JSON.stringify({ forced_logout: true })]
    );

    this.clearPasswordChangeAttempts(userId);
    await this.sendPasswordChangeNotification(result.rows[0].email);

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
