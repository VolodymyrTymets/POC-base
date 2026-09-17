import { Field, ObjectType } from '@nestjs/graphql';
import { AccountProfileEntity } from '../../account-profile/entities/account-profile.entity';
import { BasicEntityWithUpdatedAt } from '../../common/entity/basic.entity';

@ObjectType()
export class AccountEntity extends BasicEntityWithUpdatedAt {
  @Field(() => AccountProfileEntity, { nullable: true })
  AccountProfile?: AccountProfileEntity;
}
