import { InputType, Field } from '@nestjs/graphql';
import { IsByteLength } from 'class-validator';

@InputType()
export class ChangePasswordInput {
  @IsByteLength(1, 72)
  @Field(() => String, { description: 'the password the account has now' })
  currentPassword!: string;

  // bcrypt silently ignores everything past 72 bytes, so cap in bytes, not characters.
  @IsByteLength(8, 72)
  @Field(() => String, { description: 'the new password, 8 to 72 bytes' })
  newPassword!: string;
}
