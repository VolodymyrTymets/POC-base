import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateFileInput } from '../dto/create-file.input';
import { UpdateFileInput } from '../dto/update-file.input';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FileAssertService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.max_size =
      this.configService.get<number>('FILE_MAX_SIZE') ?? 1024 * 1024 * 10;
    this.allowed_mime_types = this.configService.get<string[]>(
      'FILE_ALLOWED_MIME_TYPES',
    ) ?? ['image/jpeg', 'image/png'];
  }

  private max_size: number;
  private allowed_mime_types: string[];

  private assertMimeType(mimeType: string) {
    return this.allowed_mime_types.includes(mimeType);
  }

  assertFileInput(input: CreateFileInput) {
    const { size, mimeType, content } = input;
    if (size && size > this.max_size) {
      throw new ForbiddenException();
    }
    if (mimeType && !this.assertMimeType(mimeType)) {
      throw new ForbiddenException();
    }
    if (content && Buffer.byteLength(content, 'base64') > this.max_size) {
      throw new ForbiddenException();
    }
    return true;
  }

  async assertUpdateFile(
    fileId: string,
    input: UpdateFileInput,
    accountId: string,
  ) {
    this.assertFileInput(input);
    const count = await this.prisma.file.count({
      where: {
        id: fileId,
        createdById: accountId,
      },
    });
    if (!count) {
      throw new ForbiddenException();
    }
  }

  async assertFileAccessByAccount(fileId: string, accountId: string) {
    const count = await this.prisma.file.count({
      where: {
        id: fileId,
        createdById: accountId,
      },
    });
    if (!count) {
      throw new ForbiddenException();
    }
    return true;
  }
}
