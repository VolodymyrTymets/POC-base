import { InputType, Field } from '@nestjs/graphql';
import { IsEmail, MaxLength } from 'class-validator';

@InputType()
export class RestorePasswordInput {
  @IsEmail()
  @MaxLength(254)
  @Field(() => String, { description: 'email of the account to recover' })
  email!: string;
}
