import { InputType, Field } from '@nestjs/graphql';
import { IsPhoneNumber, IsString, MaxLength } from 'class-validator';

@InputType()
export class VerifyOtpInput {
  @IsPhoneNumber()
  @Field(() => String)
  phoneNumber!: string;

  @IsString()
  @MaxLength(6)
  @Field(() => String)
  code!: string;
}
