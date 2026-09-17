import { ObjectType, Field } from '@nestjs/graphql';

import { FileEntity } from './file.entity';

@ObjectType()
export class CreateFileEntity {
  @Field(() => FileEntity)
  file!: FileEntity;

  @Field(() => String)
  uploadUrl!: string;
}
