import { InputType, Field } from '@nestjs/graphql';
import {
  IsByteLength,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NO_CONTROL_CHARACTERS } from '../../common/password-rules';

@InputType()
export class ResetPasswordInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Field(() => String, { description: 'token from the password reset email' })
  token!: string;

  // bcrypt silently ignores everything past 72 bytes, so cap in bytes, not characters.
  @IsByteLength(8, 72)
  @Matches(NO_CONTROL_CHARACTERS, {
    message: 'newPassword must not contain control characters',
  })
  @Field(() => String, { description: 'the new password, 8 to 72 bytes' })
  newPassword!: string;
}
