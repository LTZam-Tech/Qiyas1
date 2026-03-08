import { Client } from 'minio';
import config from '@/config';
import logger from '@/utils/logger';
import { unlink } from 'fs/promises';
import path from 'path';

class StorageService {
  private client: Client;
  private evidenceBucket: string;
  private reportsBucket: string;
  private templatesBucket: string;

  constructor() {
    this.client = new Client({
      endPoint: config.storage.endpoint,
      port: config.storage.port,
      useSSL: config.storage.useSSL,
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey,
    });

    this.evidenceBucket = config.storage.buckets.evidence;
    this.reportsBucket = config.storage.buckets.reports;
    this.templatesBucket = config.storage.buckets.templates;

    this.ensureBuckets();
  }

  private async ensureBuckets() {
    try {
      const buckets = [this.evidenceBucket, this.reportsBucket, this.templatesBucket];
      
      for (const bucket of buckets) {
        try {
          const exists = await this.client.bucketExists(bucket);
          if (!exists) {
            await this.client.makeBucket(bucket, 'us-east-1');
            logger.info(`Created bucket: ${bucket}`);
          }
        } catch (bucketError) {
          logger.warn(`Could not verify or create bucket ${bucket}: ${bucketError}`);
        }
      }
    } catch (error) {
      logger.error('Failed to ensure buckets', error);
    }
  }

  async uploadFile(
    filePath: string,
    fileName: string,
    bucket: 'evidence' | 'reports' | 'templates' = 'evidence'
  ): Promise<string> {
    const bucketName = bucket === 'evidence' ? this.evidenceBucket :
                       bucket === 'reports' ? this.reportsBucket :
                       this.templatesBucket;

    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `${Date.now()}-${safeName}`;

    try {
      await this.client.fPutObject(bucketName, objectName, filePath, {
        'Content-Type': this.getMimeType(fileName),
      });

      logger.info(`File uploaded: ${objectName} to bucket ${bucketName}`);

      // Delete temp file
      await unlink(filePath);

      return objectName;
    } catch (error) {
      logger.error('File upload failed', error);
      throw error;
    }
  }

  async getSignedUrl(objectName: string, bucket: 'evidence' | 'reports' | 'templates' = 'evidence', expirySeconds: number = 900): Promise<string> {
    const bucketName = bucket === 'evidence' ? this.evidenceBucket :
                       bucket === 'reports' ? this.reportsBucket :
                       this.templatesBucket;

    try {
      const url = await this.client.presignedGetObject(bucketName, objectName, expirySeconds);
      return url;
    } catch (error) {
      logger.error('Failed to generate signed URL', error);
      throw error;
    }
  }

  async deleteFile(objectName: string, bucket: 'evidence' | 'reports' | 'templates' = 'evidence'): Promise<void> {
    const bucketName = bucket === 'evidence' ? this.evidenceBucket :
                       bucket === 'reports' ? this.reportsBucket :
                       this.templatesBucket;

    try {
      await this.client.removeObject(bucketName, objectName);
      logger.info(`File deleted: ${objectName} from bucket ${bucketName}`);
    } catch (error) {
      logger.error('File deletion failed', error);
      throw error;
    }
  }

  async getFileMetadata(objectName: string, bucket: 'evidence' | 'reports' | 'templates' = 'evidence') {
    const bucketName = bucket === 'evidence' ? this.evidenceBucket :
                       bucket === 'reports' ? this.reportsBucket :
                       this.templatesBucket;

    try {
      const stat = await this.client.statObject(bucketName, objectName);
      return stat;
    } catch (error) {
      logger.error('Failed to get file metadata', error);
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
