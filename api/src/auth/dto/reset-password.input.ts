import { InputType, Field } from '@nestjs/graphql';
import { IsByteLength, IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class ResetPasswordInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Field(() => String, { description: 'token from the password reset email' })
  token!: string;

  // bcrypt silently ignores everything past 72 bytes, so cap in bytes, not characters.
  @IsByteLength(8, 72)
  @Field(() => String, { description: 'the new password, 8 to 72 bytes' })
  newPassword!: string;
}
