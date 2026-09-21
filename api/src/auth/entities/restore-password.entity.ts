import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class RestorePasswordEntity {
  @Field(() => Boolean, {
    description:
      'Always true for a well-formed request, whether or not the email is registered',
  })
  success!: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Reset token, only returned in local/development/test',
  })
  token?: string;
}
