import { InputType, Field } from '@nestjs/graphql';
import { MaxLength, IsString, IsOptional, IsInt } from 'class-validator';

@InputType()
export class CreateFileInput {
  @IsString()
  @MaxLength(255)
  @IsOptional()
  @Field(() => String, { description: 'file name', nullable: true })
  name?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  @Field(() => String, { description: 'file mime type', nullable: true })
  mimeType?: string;

  @IsInt()
  @Field(() => Number, { description: 'file size', nullable: true })
  @IsOptional()
  size?: number;
}
