import {
  Resolver,
  ResolveField,
  Parent,
  Query,
  Args,
  Mutation,
} from '@nestjs/graphql';

import { FileEntity } from './entities/file.entity';
import { S3ManagerService } from './services/s3-manager.service';
import { FilesService } from './files.service';
import { CreateFileInput } from './dto/create-file.input';
import { CreateFileEntity } from './entities/create-file.entity';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentAccount } from '../decorators/current-account.decorator';
import type { AuthAccount } from '../auth/strategies/jwt.strategy';
import { FileAssertService } from './services/file-assert.service';
import { UpdateFileInput } from './dto/update-file.input';

@Resolver(() => FileEntity)
export class FilesResolver {
  constructor(
    private readonly s3ManagerService: S3ManagerService,
    private readonly filesService: FilesService,
    private readonly fileAssertService: FileAssertService,
  ) {}

  @Mutation(() => CreateFileEntity, {
    description: 'Create a new file. Generate upload URL.',
  })
  @UseGuards(GqlAuthGuard)
  createFile(
    @Args('input') input: CreateFileInput,
    @CurrentAccount() currentAccount: AuthAccount,
  ): Promise<CreateFileEntity> {
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
  ): Promise<FileEntity | null> {
    await this.fileAssertService.assertFileAccessByAccount(
      fileId,
      currentAccount.accountId,
    );

    return this.filesService.findFile(fileId);
  }

  @ResolveField(() => String)
  publicUrl(@Parent() file: FileEntity) {
    if (!file.key) {
      return null;
    }
    return this.s3ManagerService.getPublicUrl(file.key);
  }
}
