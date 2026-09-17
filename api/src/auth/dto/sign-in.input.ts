import { InputType, Field } from '@nestjs/graphql';
import { IsPhoneNumber } from 'class-validator';

@InputType()
export class SignInInput {
  @IsPhoneNumber()
  @Field(() => String, { description: 'phoneNumber' })
  phoneNumber!: string;
}
