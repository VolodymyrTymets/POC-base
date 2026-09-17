import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { AwsSdkModule } from 'aws-sdk-v3-nest';
import { FilesService } from './files.service';
import { FilesResolver } from './files.resolver';
import { S3ManagerService } from './services/s3-manager.service';
import { PrismaModule } from '../prisma/prisma.module';
import { FileAssertService } from './services/file-assert.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    AwsSdkModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      clientType: S3Client,
      useFactory: (configService: ConfigService) => {
        if (
          process.env.NODE_ENV === 'local' ||
          process.env.NODE_ENV === 'test'
        ) {
          return new S3Client({
            region: configService.get<string>('AWS_REGION'),
            credentials: {
              accessKeyId: configService.get<string>('AWS_ACCESS_KEY_ID') || '',
              secretAccessKey:
                configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
            },
          });
        }
        return new S3Client({
          region: configService.getOrThrow<string>('AWS_REGION'),
          credentials: {
            accessKeyId: configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
            secretAccessKey: configService.getOrThrow<string>(
              'AWS_SECRET_ACCESS_KEY',
            ),
          },
        });
      },
    }),
  ],
  providers: [FilesResolver, FilesService, S3ManagerService, FileAssertService],
  exports: [FilesService, FileAssertService],
})
export class FilesModule {}
