import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '@/config';
import db from '@/db';
import { UnauthorizedError, ForbiddenError } from '@/utils/errors';
import logger from '@/utils/logger';
import { JwtPayload } from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

interface AccessTokenPayload extends JwtPayload {
  userId: string;
  role: string;
}

const toError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  return new Error('Unknown authorization error');
};

const getJwtVerificationKey = (): string => {
  if (config.jwt.algorithm === 'RS256') {
    if (!config.jwt.accessPublicKey) {
      throw new UnauthorizedError('JWT public key is not configured');
    }
    return config.jwt.accessPublicKey;
  }

  return config.jwt.accessSecret;
};

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, getJwtVerificationKey(), {
        algorithms: [config.jwt.algorithm],
      }) as AccessTokenPayload;

      if (!decoded?.userId) {
        throw new UnauthorizedError('Invalid token payload');
      }

      // Fetch user with role and permissions
      const result = await db.query(`
        SELECT 
          u.id,
          u.email,
          u.name as full_name,
          u.is_active,
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
        GROUP BY u.id, u.email, u.name, u.is_active, r.name
      `, [decoded.userId]);

      if (result.rows.length === 0) {
        throw new UnauthorizedError('User not found');
      }

      const user = result.rows[0];

      if (!user.is_active) {
        throw new UnauthorizedError('Account is not active');
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      };

      next();
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Invalid token');
      }
      throw error;
    }
  } catch (error) {
    next(toError(error));
  }
};

export const authorize = (...requiredPermissions: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      // Admin bypasses all permission checks
      if (req.user.role === 'admin') {
        return next();
      }

      // Check if user has at least one of the required permissions
      const hasPermission = requiredPermissions.some((permission) =>
        req.user!.permissions.includes(permission)
      );

      if (!hasPermission) {
        logger.warn('Authorization failed', {
          userId: req.user.id,
          role: req.user.role,
          requiredPermissions,
          userPermissions: req.user.permissions,
        });
        const required = requiredPermissions.join(', ');
        const message = config.env === 'production'
          ? 'Insufficient permissions'
          : `Insufficient permissions. Required one of: ${required}`;
        throw new ForbiddenError(message);
      }

      next();
    } catch (error) {
      next(toError(error));
    }
  };
};

// Object-level authorization helpers
export const canViewPerspective = async (userId: string, perspectiveId: string): Promise<boolean> => {
  const roleResult = await db.query(
    `SELECT r.name as role
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );

  const role = roleResult.rows[0]?.role;
  if (role === 'admin' || role === 'dean' || role === 'consultant') {
    return true;
  }

  const result = await db.query(`
    SELECT 1
    FROM tasks t
    WHERE t.perspective_id = $1
      AND t.assigned_to = $2
    LIMIT 1
  `, [perspectiveId, userId]);

  return result.rows.length > 0;
};

export const canEditPerspective = async (userId: string, perspectiveId: string): Promise<boolean> => {
  const result = await db.query(`
    SELECT r.name FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1
  `, [userId]);
  
  if (result.rows.length === 0) return false;

  const perspectiveExists = await db.query(
    'SELECT 1 FROM perspectives WHERE id = $1 LIMIT 1',
    [perspectiveId]
  );
  if (perspectiveExists.rows.length === 0) return false;
  
  const role = result.rows[0].name;
  return role === 'admin' || role === 'consultant';
};

export const canViewTask = async (userId: string, taskId: string): Promise<boolean> => {
  const result = await db.query(`
    SELECT 
      t.assigned_to,
      r.name as role
    FROM tasks t
    LEFT JOIN users u ON u.id = $1
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE t.id = $2
  `, [userId, taskId]);
  
  if (result.rows.length === 0) return false;
  
  const task = result.rows[0];
  const role = task.role;
  
  // Admin, dean and consultant can view all tasks
  if (role === 'admin' || role === 'dean' || role === 'consultant') return true;
  
  // Assigned user can view their task
  if (task.assigned_to === userId) return true;
  
  return false;
};

export const canSubmitEvidence = async (userId: string, taskId: string): Promise<boolean> => {
  const permissionResult = await db.query(
    `SELECT 1
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     LEFT JOIN role_permissions rp ON r.id = rp.role_id
     LEFT JOIN permissions p ON rp.permission_id = p.id
     WHERE u.id = $1 AND p.name = 'evidence:submit'
     LIMIT 1`,
    [userId]
  );

  if (permissionResult.rows.length === 0) return false;

  const result = await db.query(`
    SELECT assigned_to, status FROM tasks WHERE id = $1
  `, [taskId]);
  
  if (result.rows.length === 0) return false;
  
  const task = result.rows[0];
  
  // Only assigned user can submit evidence
  if (task.assigned_to !== userId) return false;
  
  // Task must be in a state that allows submission
  if (!['in_progress', 'assigned', 'resubmission_required'].includes(task.status)) return false;
  
  return true;
};

export const canReviewSubmission = async (userId: string, submissionId: string): Promise<boolean> => {
  const result = await db.query(`
    SELECT 
      r.name as role,
      es.status
    FROM evidence_submissions es
    LEFT JOIN users u ON u.id = $1
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE es.id = $2
  `, [userId, submissionId]);
  
  if (result.rows.length === 0) return false;
  
  const data = result.rows[0];
  const role = data.role;
  
  // Both consultants and admins can review evidence
  if (role !== 'consultant' && role !== 'admin') return false;
  
  // Submission must be in a reviewable state
  if (data.status !== 'submitted' && data.status !== 'under_review') return false;
  
  return true;
};
