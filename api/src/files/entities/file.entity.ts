import { ObjectType, Field } from '@nestjs/graphql';

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

  @Field(() => Date)
  createdAt!: Date;

  content?: Uint8Array | null;

  @Field(() => String, { nullable: true, description: 'public url' })
  publicUrl?: string;
}
