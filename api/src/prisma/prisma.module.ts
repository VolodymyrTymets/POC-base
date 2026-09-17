import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IPrismaFactory, PrismaCashingService } from './prisma.caching.service';
import { PRISMA_FACTORY } from './prisma.const';

@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory(): PrismaService {
        return new PrismaService();
      },
    },
    {
      provide: PRISMA_FACTORY,
      useFactory: (): IPrismaFactory => {
        return {
          create: function (config) {
            if (process.env.NODE_ENV === 'test') {
              return new PrismaService();
            }
            return config.withRedis
              ? new PrismaCashingService().create()
              : new PrismaService();
          },
        };
      },
    },
  ],
  exports: [PrismaService, PRISMA_FACTORY],
})
export class PrismaModule {}
