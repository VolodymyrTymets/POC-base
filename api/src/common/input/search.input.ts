import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class SearchInput {
  @Field(() => String, {
    nullable: true,
    description: 'default search argument',
  })
  slug?: string;
}
