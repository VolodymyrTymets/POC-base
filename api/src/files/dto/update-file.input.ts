import { InputType, Field } from '@nestjs/graphql';
import { FileStatus } from '../../../generated/prisma/enums';
import { CreateFileInput } from './create-file.input';
import { IsEnum } from 'class-validator';

@InputType()
export class UpdateFileInput extends CreateFileInput {
  @IsEnum(FileStatus, {
    message: 'status must be one of the FileStatus values.',
  })
  @Field(() => FileStatus, { description: 'file status' })
  status?: FileStatus;
}
