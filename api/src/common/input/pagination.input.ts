import { InputType, Field, Int } from '@nestjs/graphql';;

@InputType()
export class PaginationInput {
  @Field(() => Int, {
    description: 'take',
    nullable: true,
  })
  take?: number;

  @Field(() => Int, {
    nullable: true,
    description: 'skip',
  })
  skip?: number;
}
