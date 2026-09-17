import { GraphQLResolveInfo } from 'graphql/type';
import { getPrismaIncludeFromGqInfo, GraphToPrisma } from './GraphToPrisma';
import { IPrismaFactory } from '../prisma/prisma.caching.service';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaCashingService } from './prismacashing.service';

export class PaginationService extends PrismaCashingService {
  protected prismaService: PrismaClient;
  constructor(protected prismaFactory: IPrismaFactory) {
    super(prismaFactory);
    this.prismaService = this.getPrismaService({ withRedis: true });
  }

  findAll<T>(collection: string, findManyArgs: T, info?: GraphQLResolveInfo) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return this.prismaService[collection].findMany({
      ...findManyArgs,
      select: getPrismaIncludeFromGqInfo(info),
    });
  }

  count<T>(
    collection: string,
    findManyArgs: T,
    info?: GraphQLResolveInfo,
  ): Promise<number> {
    const { include = {} } = info ? new GraphToPrisma(info) : {};
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { take, skip, ...findCountArgs } = findManyArgs || {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return include.total
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
        this.prismaService[collection].count(findCountArgs)
      : new Promise((resolve) => resolve(0));
  }
  async findAllPaginated<T, O>(
    collection: string,
    findArgs: T,
    info?: GraphQLResolveInfo,
  ): Promise<{ collection: O[]; total: number }> {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      collection: await this.findAll<T>(collection, findArgs, info),
      total: await this.count<T>(collection, findArgs, info),
    };
  }
}
