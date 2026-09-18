import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFileInput } from './dto/create-file.input';
import { UpdateFileInput } from './dto/update-file.input';
import { AuthAccount } from '../auth/strategies/jwt.strategy';

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  createFile(input: CreateFileInput, currentAccount: AuthAccount) {
    const content = input.content
      ? Buffer.from(input.content, 'base64')
      : undefined;

    return this.prisma.file.create({
      data: {
        name: input.name,
        // Trust the decoded bytes over the client-declared size once content
        // is present - the two can otherwise disagree (rule D5).
        size: content ? content.byteLength : input.size,
        mimeType: input.mimeType,
        createdById: currentAccount.accountId,
        content,
      },
    });
  }

  updateFile(fileId: string, input: UpdateFileInput) {
    const content = input.content
      ? Buffer.from(input.content, 'base64')
      : undefined;

    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        name: input.name,
        size: content ? content.byteLength : input.size,
        mimeType: input.mimeType,
        content,
        updatedAt: new Date(),
      },
    });
  }

  findFile(fileId: string, includeContent = false) {
    return this.prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
        content: includeContent,
      },
    });
  }
}
