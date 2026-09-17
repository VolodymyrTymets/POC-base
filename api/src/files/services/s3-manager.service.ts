import { Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InjectAws } from 'aws-sdk-v3-nest';
import { ConfigService } from '@nestjs/config';
import { IS3ManagerService } from './s3-manager.interface';

@Injectable()
export class S3ManagerService implements IS3ManagerService {
  constructor(
    @InjectAws(S3Client) private readonly s3Client: S3Client,
    private readonly configService: ConfigService,
  ) {}

  private get bucketName() {
    if (process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'test') {
      return this.configService.get<string>('AWS_S3_BUCKET_NAME');
    }
    return this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
  }

  generateKey(fileId: string, fileName: string) {
    return `${fileId}_${fileName.split('.')[0]}`;
  }

  getSignedUrl(fileKey: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn:
        this.configService.get<number>('AWS_UPLOUD_URL_EXPIRES_IN') || 900,
    });
  }

  getPublicUrl(fileKey: string) {
    const readCommand = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
    });

    return getSignedUrl(this.s3Client, readCommand, {
      expiresIn:
        this.configService.get<number>('AWS_PUBLIC_URL_EXPIRES_IN') || 3600,
    });
  }
}
