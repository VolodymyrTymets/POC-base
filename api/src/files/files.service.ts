import { Injectable } from '@nestjs/common';
import { FileStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFileInput } from './dto/create-file.input';
import { UpdateFileInput } from './dto/update-file.input';
import { AuthAccount } from '../auth/strategies/jwt.strategy';

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  createFile(input: CreateFileInput, currentAccount: AuthAccount) {
    return this.prisma.file.create({
      data: {
        name: input.name,
        size: input.size,
        mimeType: input.mimeType,
        createdById: currentAccount.accountId,
        content: input.content
          ? Buffer.from(input.content, 'base64')
          : undefined,
        status: input.content
          ? FileStatus.FILE_STATUS_UPLOAD_COMPLETED
          : FileStatus.FILE_STATUS_CREATED,
      },
    });
  }

  updateFile(fileId: string, input: UpdateFileInput) {
    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        name: input.name,
        size: input.size,
        mimeType: input.mimeType,
        status: input.status,
        content: input.content
          ? Buffer.from(input.content, 'base64')
          : undefined,
        updatedAt: new Date(),
      },
    });
  }

  findFile(fileId: string) {
    return this.prisma.file.findUnique({ where: { id: fileId } });
  }
}
