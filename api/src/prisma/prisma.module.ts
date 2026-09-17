import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IPrismaFactory, PrismaCashingService } from './prisma.caching.service';
import { PRISMA_FACTORY } from './prisma.const';
import { PrismaAdapterFactory } from './prisma.adapter.factory';

@Module({
  providers: [
    PrismaAdapterFactory,
    {
      provide: PrismaService,
      useFactory(factory: PrismaAdapterFactory): PrismaService {
        return new PrismaService(factory);
      },
      inject: [PrismaAdapterFactory],
    },
    {
      provide: PRISMA_FACTORY,
      useFactory: (factory: PrismaAdapterFactory): IPrismaFactory => {
        return {
          create: function (config) {
            if (process.env.NODE_ENV === 'test') {
              return new PrismaService(factory);
            }
            return config.withRedis
              ? new PrismaCashingService(factory).create()
              : new PrismaService(factory);
          },
        };
      },
      inject: [PrismaAdapterFactory],
    },
  ],
  exports: [PrismaService, PRISMA_FACTORY],
})
export class PrismaModule {}
