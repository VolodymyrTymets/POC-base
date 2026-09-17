export interface IS3ManagerService {
  generateKey(fileId: string, fileName: string): string;
  getSignedUrl(fileKey: string): Promise<string>;
  getPublicUrl(fileKey: string): Promise<string>;
}
