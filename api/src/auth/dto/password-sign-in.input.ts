import { InputType, Field } from '@nestjs/graphql';
import { IsByteLength, IsEmail, MaxLength } from 'class-validator';

@InputType()
export class PasswordSignInInput {
  @IsEmail()
  @MaxLength(254)
  @Field(() => String, { description: 'email the account signed up with' })
  email!: string;

  // No lower bound beyond "not empty": length rules belong to sign-up, and
  // a wrong-length password must fail as bad credentials, not as a hint.
  @IsByteLength(1, 72)
  @Field(() => String, { description: 'password' })
  password!: string;
}
