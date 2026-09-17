import { InputType, Field } from '@nestjs/graphql';
import {
  MaxLength,
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';

@InputType()
export class UpdateAccountProfileInput {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Field(() => String, { nullable: true, description: 'firstName' })
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Field(() => String, { nullable: true, description: 'lastName' })
  lastName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Field(() => String, { nullable: true, description: 'email' })
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50, {
    message: 'middleName must be less than 50 characters',
  })
  @Field(() => String, { nullable: true, description: 'middleName' })
  middleName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  @Field(() => String, { nullable: true, description: 'dataOfBirth' })
  dataOfBirth?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  @Field(() => String, { nullable: true, description: 'SSN' })
  SSN?: string;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, {
    nullable: true,
    description: 'is18YearOld',
    defaultValue: false,
  })
  is18YearOld?: boolean;

  @IsOptional()
  @IsUUID()
  @Field(() => String, {
    nullable: true,
  })
  avatarId?: string;
}
