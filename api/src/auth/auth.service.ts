import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prismaService: PrismaService) {}

  signOut(accountId: string) {
    return this.prismaService.accountIdentity.update({
      where: { accountId },
      data: { refreshToken: null, otpHash: null, otpSalt: null },
    });
  }
}
