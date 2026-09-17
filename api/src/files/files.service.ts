import { Injectable } from '@nestjs/common';
import { FileStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFileInput } from './dto/create-file.input';
import { S3ManagerService } from './services/s3-manager.service';
import { AuthAccount } from '../auth/strategies/jwt.strategy';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3ManagerService: S3ManagerService,
  ) {}

  async createFile(input: CreateFileInput, currentAccount: AuthAccount) {
    const file = await this.prisma.file.create({
      data: {
        name: input.name,
        size: input.size,
        mimeType: input.mimeType,
        createdById: currentAccount.accountId,
        status: FileStatus.FILE_STATUS_CREATED,
      },
    });

    const fileKey = this.s3ManagerService.generateKey(file.id, file.name || '');
    await this.prisma.file.update({
      where: { id: file.id },
      data: { key: fileKey },
    });

    const uploadUrl = await this.s3ManagerService.getSignedUrl(fileKey);

    return {
      file,
      uploadUrl,
    };
  }

  updateFile(fileId: string, data: Prisma.FileUpdateInput) {
    return this.prisma.file.update({
      where: { id: fileId },
      data: { ...data, updatedAt: new Date() },
    });
  }

  findFile(fileId: string) {
    return this.prisma.file.findUnique({ where: { id: fileId } });
  }
}
