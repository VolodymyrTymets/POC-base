import { ObjectType, Field } from '@nestjs/graphql';
import { registerEnumType } from '@nestjs/graphql';
import { FileStatus } from '../../../generated/prisma/enums';

@ObjectType()
export class FileEntity {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  mimeType?: string | null;

  @Field(() => Number, { nullable: true })
  size?: number | null;

  @Field(() => FileStatus)
  status!: FileStatus;

  @Field(() => Date)
  createdAt!: Date;

  key?: string | null;

  @Field(() => String, { nullable: true, description: 'public url' })
  publicUrl?: string;
}

registerEnumType(FileStatus, {
  name: 'FileStatus',
});
