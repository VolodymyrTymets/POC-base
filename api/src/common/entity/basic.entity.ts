import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class BasicEntity {
  @Field(() => String, { description: 'id' })
  id!: string;
}

@ObjectType()
export class BasicEntityWithCreatedAt extends BasicEntity {
  @Field(() => Date, { nullable: true, description: 'createdAt' })
  createdAt?: Date;
}

@ObjectType()
export class BasicEntityWithUpdatedAt extends BasicEntityWithCreatedAt {
  @Field(() => Date, { nullable: true, description: 'updatedAt' })
  updatedAt?: Date | null;
}
