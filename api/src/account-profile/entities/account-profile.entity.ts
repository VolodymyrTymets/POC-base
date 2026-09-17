import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AccountProfileEntity {
  @Field(() => String, { description: 'id' })
  id!: string;
  @Field(() => String, { description: 'phoneNumber', nullable: false })
  phoneNumber!: string | null;
  @Field(() => String, { description: 'firstName', nullable: true })
  firstName!: string | null;
  @Field(() => String, { description: 'lastName', nullable: true })
  lastName!: string | null;
  @Field(() => String, { description: 'middleName', nullable: true })
  middleName!: string | null;
  @Field(() => String, { description: 'dataOfBirth', nullable: true })
  dataOfBirth!: string | null;
  @Field(() => String, { description: 'SSN', nullable: true })
  SSN!: string | null;
  @Field(() => String, { description: 'email', nullable: true })
  email!: string | null;

  @Field(() => Boolean, {
    description: 'isPhoneVerified',
    nullable: false,
  })
  isPhoneVerified!: boolean;
}
