import { InputType, Field } from '@nestjs/graphql';

export type SortingType = Record<string, 'asc' | 'desc'>;

@InputType()
export class SortingInput {
  @Field(() => String, { description: 'sorting field' })
  field!: string;

  @Field(() => String, { description: 'sorting order' })
  order!: 'asc' | 'desc';
}
