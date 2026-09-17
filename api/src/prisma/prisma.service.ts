import { Injectable } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaAdapterFactory } from './prisma.adapter.factory';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(factory: PrismaAdapterFactory) {
    super({ adapter: factory.create() });
  }
}
