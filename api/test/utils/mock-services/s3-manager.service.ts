import { Injectable } from '@nestjs/common';
import { IS3ManagerService } from '../../../src/files/services/s3-manager.interface';

@Injectable()
export class S3ManagerMockService implements IS3ManagerService {
  constructor() {}

  private readonly publicUrl = 'https://dummyimage.com/600x400/000/fff';
  private readonly privateUrl = 'https://dummyimage.com/600x400/000/fff';

  public get _signedUrl() {
    return this.privateUrl;
  }

  public get _publicUrl() {
    return this.publicUrl;
  }

  generateKey(fileId: string, fileName: string) {
    return `${fileId}_${fileName.split('.')[0]}`;
  }

  getSignedUrl(fileKey: string) {
    return new Promise<string>((resolve) => resolve(this.publicUrl));
  }

  getPublicUrl(fileKey: string) {
    return new Promise<string>((resolve) => resolve(this.publicUrl));
  }
}
