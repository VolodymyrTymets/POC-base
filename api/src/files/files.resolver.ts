import {
  Resolver,
  ResolveField,
  Parent,
  Query,
  Args,
  Mutation,
  Info,
} from '@nestjs/graphql';
import type { GraphQLResolveInfo, SelectionNode } from 'graphql';

import { FileEntity } from './entities/file.entity';
import { FilesService } from './files.service';
import { CreateFileInput } from './dto/create-file.input';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentAccount } from '../decorators/current-account.decorator';
import type { AuthAccount } from '../auth/strategies/jwt.strategy';
import { FileAssertService } from './services/file-assert.service';
import { UpdateFileInput } from './dto/update-file.input';

@Resolver(() => FileEntity)
export class FilesResolver {
  constructor(
    private readonly filesService: FilesService,
    private readonly fileAssertService: FileAssertService,
  ) {}

  @Mutation(() => FileEntity, {
    description: 'Create a new file, optionally with its content.',
  })
  @UseGuards(GqlAuthGuard)
  createFile(
    @Args('input') input: CreateFileInput,
    @CurrentAccount() currentAccount: AuthAccount,
  ): Promise<FileEntity> {
    this.fileAssertService.assertFileInput(input);
    return this.filesService.createFile(input, currentAccount);
  }

  @Mutation(() => FileEntity, { description: 'Update a file.' })
  @UseGuards(GqlAuthGuard)
  async updateFile(
    @Args('fileId') fileId: string,
    @Args('input') input: UpdateFileInput,
    @CurrentAccount() currentAccount: AuthAccount,
  ): Promise<FileEntity> {
    await this.fileAssertService.assertUpdateFile(
      fileId,
      input,
      currentAccount.accountId,
    );

    return this.filesService.updateFile(fileId, input);
  }

  @Query(() => FileEntity, { name: 'file', nullable: true })
  @UseGuards(GqlAuthGuard)
  async file(
    @Args('fileId') fileId: string,
    @CurrentAccount() currentAccount: AuthAccount,
    @Info() info: GraphQLResolveInfo,
  ): Promise<FileEntity | null> {
    await this.fileAssertService.assertFileAccessByAccount(
      fileId,
      currentAccount.accountId,
    );

    return this.filesService.findFile(fileId, wantsPublicUrl(info));
  }

  @ResolveField(() => String)
  publicUrl(@Parent() file: FileEntity) {
    if (!file.content || !file.mimeType) {
      return null;
    }
    return `data:${file.mimeType};base64,${Buffer.from(file.content).toString('base64')}`;
  }
}

/**
 * `content` (bytea, up to FILE_MAX_SIZE) is only worth selecting from Prisma
 * when the client actually requested `publicUrl` - see ADR-0010. Walks
 * fragment spreads and inline fragments too (not just direct field
 * selections), the same way `GraphToPrisma` resolves `info.fragments` for
 * this repo's relation-selection convention (rule 9), so a fragment-based
 * client (e.g. graphql-codegen's client-preset, ADR-0008) doesn't silently
 * get `publicUrl: null` for a file that actually has content.
 */
function wantsPublicUrl(info: GraphQLResolveInfo): boolean {
  const visit = (selections: readonly SelectionNode[]): boolean =>
    selections.some((selection) => {
      if (selection.kind === 'Field') {
        return selection.name.value === 'publicUrl';
      }
      if (selection.kind === 'FragmentSpread') {
        const fragment = info.fragments[selection.name.value];
        return fragment
          ? visit(fragment.selectionSet.selections)
          : false;
      }
      // InlineFragment
      return visit(selection.selectionSet.selections);
    });

  return visit(info.fieldNodes[0]?.selectionSet?.selections ?? []);
}
