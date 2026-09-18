import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GraphQLResolveInfo, SelectionNode } from 'graphql';
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
    // Bytes are stored and served back as a data:<mimeType>;base64,... URI
    // (ADR-0010), so a mimeType is required whenever content is present -
    // the allowlist below would otherwise be silently bypassable.
    if (content && !mimeType) {
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
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      select: { createdById: true, mimeType: true },
    });
    if (!file || file.createdById !== accountId) {
      throw new ForbiddenException();
    }
    // A client attaching content in a second call (create, then update)
    // doesn't have to resend mimeType - fall back to the record's stored
    // value so the mimeType-required-with-content check (above) still runs
    // against a real, already-allowlisted type instead of rejecting a
    // legitimate two-step upload.
    this.assertFileInput({
      ...input,
      mimeType: input.mimeType ?? file.mimeType ?? undefined,
    });
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

  /**
   * `content` (bytea, up to FILE_MAX_SIZE) is only worth selecting from
   * Prisma when the client actually requested `publicUrl` - see ADR-0010.
   * Walks fragment spreads and inline fragments too (not just direct field
   * selections), the same way `GraphToPrisma` resolves `info.fragments` for
   * this repo's relation-selection convention (rule 9), so a fragment-based
   * client (e.g. graphql-codegen's client-preset, ADR-0008) doesn't silently
   * get `publicUrl: null` for a file that actually has content.
   */
  wantsPublicUrl(info: GraphQLResolveInfo): boolean {
    const visit = (selections: readonly SelectionNode[]): boolean =>
      selections.some((selection) => {
        if (selection.kind === 'Field') {
          return selection.name.value === 'publicUrl';
        }
        if (selection.kind === 'FragmentSpread') {
          const fragment = info.fragments[selection.name.value];
          return fragment ? visit(fragment.selectionSet.selections) : false;
        }
        // InlineFragment
        return visit(selection.selectionSet.selections);
      });

    return visit(info.fieldNodes[0]?.selectionSet?.selections ?? []);
  }
}
