import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class SignInOtpEntity {
  @Field(() => Boolean, { description: 'Is success sent to user' })
  success!: boolean;

  @Field(() => String, { nullable: true })
  code?: string;
}
