import config from '@/config';
import logger from '@/utils/logger';
import { unlink, mkdir, stat, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

class StorageService {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'uploads');
    this.ensureBuckets();
  }

  private async ensureBuckets() {
    try {
      const buckets = ['evidence', 'reports', 'templates'];
      if (!existsSync(this.baseDir)) {
        await mkdir(this.baseDir, { recursive: true });
      }
      for (const bucket of buckets) {
        const bucketPath = path.join(this.baseDir, bucket);
        if (!existsSync(bucketPath)) {
          await mkdir(bucketPath, { recursive: true });
          logger.info(`Created local bucket folder: ${bucketPath}`);
        }
      }
    } catch (error) {
      logger.error('Failed to create local upload directories', error);
    }
  }

  async uploadFile(
    filePath: string,
    fileName: string,
    bucket: 'evidence' | 'reports' | 'templates' = 'evidence'
  ): Promise<string> {
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `${Date.now()}-${safeName}`;
    const destPath = path.join(this.baseDir, bucket, objectName);

    try {
      await copyFile(filePath, destPath);
      logger.info(`File uploaded locally: ${objectName} to folder ${bucket}`);
      
      // Delete temp file from multer
      await unlink(filePath).catch(() => {});

      return objectName;
    } catch (error) {
      logger.error('File local copy failed', error);
      throw error;
    }
  }

  getFilePath(objectName: string, bucket: 'evidence' | 'reports' | 'templates' = 'evidence'): string {
    // Reject path components so a database value cannot escape its storage bucket.
    const safeName = path.basename(objectName);
    if (!safeName || safeName !== objectName || safeName === '.' || safeName === '..') {
      throw new Error('Invalid stored object name');
    }
    return path.join(this.baseDir, bucket, safeName);
  }

  async deleteFile(objectName: string, bucket: 'evidence' | 'reports' | 'templates' = 'evidence'): Promise<void> {
    const filePath = path.join(this.baseDir, bucket, objectName);
    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
        logger.info(`File deleted locally: ${objectName} from folder ${bucket}`);
      }
    } catch (error) {
      logger.error('File local deletion failed', error);
      throw error;
    }
  }

  async getFileMetadata(objectName: string, bucket: 'evidence' | 'reports' | 'templates' = 'evidence') {
    const filePath = path.join(this.baseDir, bucket, objectName);
    try {
      const fileStat = await stat(filePath);
      return fileStat;
    } catch (error) {
      logger.error('Failed to get local file metadata', error);
      throw error;
    }
  }

  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}

export default new StorageService();
