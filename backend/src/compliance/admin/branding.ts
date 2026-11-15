/**
 * Client branding (docs/phase1/09 §7): the organization's name and logo come from
 * settings, so one release serves every client. The login screen reads them
 * before anyone signs in, so they are public; nothing else is.
 */
import { ComplianceError, Db, ServiceContext, audit, one, requirePermission } from '../core/context';
import { EvidenceDeps } from '../evidence/evidence';

const LOGO_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const MAX_LOGO_BYTES = 1024 * 1024;

/** Recognizes the image from its first bytes; the file name is not trusted. */
function sniff(content: Buffer): string | null {
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.subarray(0, 4).toString('latin1') === 'RIFF' && content.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export async function publicBranding(db: Db) {
  const row = await one(db, 'SELECT name_ar, name_en, default_language, logo_key, updated_at FROM qiyas.org_settings LIMIT 1');
  return row
    ? { nameAr: row.name_ar, nameEn: row.name_en, defaultLanguage: row.default_language, hasLogo: Boolean(row.logo_key), version: new Date(row.updated_at).getTime() }
    : { nameAr: null, nameEn: null, defaultLanguage: 'ar', hasLogo: false, version: 0 };
}

export async function logoFile(db: Db, deps: EvidenceDeps): Promise<{ content: Buffer; mimeType: string } | null> {
  const row = await one(db, 'SELECT logo_key, logo_mime_type FROM qiyas.org_settings LIMIT 1');
  if (!row?.logo_key) return null;
  return { content: await deps.storage.get(row.logo_key), mimeType: row.logo_mime_type ?? 'image/png' };
}

export async function setLogo(ctx: ServiceContext, deps: EvidenceDeps, file: { content: Buffer; filename: string }): Promise<void> {
  requirePermission(ctx, 'admin.settings');
  const ext = file.filename.split('.').pop()?.toLowerCase() ?? '';
  const type = sniff(file.content);
  if (!LOGO_TYPES[ext] || !type) throw new ComplianceError('validation', 'The logo must be a PNG, JPEG or WebP image');
  if (file.content.length > MAX_LOGO_BYTES) throw new ComplianceError('validation', 'The logo must be at most 1 MB');
  if (!(await one(ctx.db, 'SELECT 1 FROM qiyas.org_settings'))) throw new ComplianceError('conflict', 'Save the organization name first');
  if ((await deps.scanner.scan(file.content, file.filename)) !== 'clean') throw new ComplianceError('conflict', 'The virus scan rejected this file');
  const stored = await deps.storage.put(file.content);
  await ctx.db.query('UPDATE qiyas.org_settings SET logo_key = $1, logo_mime_type = $2, updated_by = $3, updated_at = $4', [stored.key, type, ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'admin.logo_set', entityType: 'org_settings', entityId: 'org', after: { sha256: stored.sha256, size: file.content.length } });
}

export async function removeLogo(ctx: ServiceContext): Promise<void> {
  requirePermission(ctx, 'admin.settings');
  await ctx.db.query('UPDATE qiyas.org_settings SET logo_key = NULL, logo_mime_type = NULL, updated_by = $1, updated_at = $2', [ctx.actor.userId, ctx.now]);
  await audit(ctx, { action: 'admin.logo_removed', entityType: 'org_settings', entityId: 'org' });
}
