import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class AuthTokensEntity {
  @Field(() => String, { description: 'JWT access token (15 min)' })
  accessToken!: string;

  @Field(() => String, { description: 'JWT refresh token (7 days)' })
  refreshToken!: string;
}
