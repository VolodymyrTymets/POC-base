import { InputType, Field } from '@nestjs/graphql';
import { IsByteLength, IsEmail, Matches, MaxLength } from 'class-validator';
import { NO_CONTROL_CHARACTERS } from '../../common/password-rules';

@InputType()
export class SignUpInput {
  @IsEmail()
  @MaxLength(254)
  @Field(() => String, { description: 'email, used as the login identifier' })
  email!: string;

  // bcrypt silently ignores everything past 72 bytes, so cap in bytes, not characters.
  @IsByteLength(8, 72)
  @Matches(NO_CONTROL_CHARACTERS, {
    message: 'password must not contain control characters',
  })
  @Field(() => String, { description: 'password, 8 to 72 bytes' })
  password!: string;
}
