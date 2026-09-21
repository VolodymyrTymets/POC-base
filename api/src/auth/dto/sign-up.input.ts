import { InputType, Field } from '@nestjs/graphql';
import { IsByteLength, IsEmail, MaxLength } from 'class-validator';

@InputType()
export class SignUpInput {
  @IsEmail()
  @MaxLength(254)
  @Field(() => String, { description: 'email, used as the login identifier' })
  email!: string;

  // bcrypt silently ignores everything past 72 bytes, so cap in bytes, not characters.
  @IsByteLength(8, 72)
  @Field(() => String, { description: 'password, 8 to 72 bytes' })
  password!: string;
}
