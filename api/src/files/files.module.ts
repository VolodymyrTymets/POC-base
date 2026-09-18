import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesResolver } from './files.resolver';
import { PrismaModule } from '../prisma/prisma.module';
import { FileAssertService } from './services/file-assert.service';

@Module({
  imports: [PrismaModule],
  providers: [FilesResolver, FilesService, FileAssertService],
  exports: [FilesService, FileAssertService],
})
export class FilesModule {}
