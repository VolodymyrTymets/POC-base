import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpCodeGeneratorService {
  private readonly BCRYPT_ROUNDS = 10;

  generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  async hashCode(code: string): Promise<{ hash: string; salt: string }> {
    const salt = await bcrypt.genSalt(this.BCRYPT_ROUNDS);
    const hash = await bcrypt.hash(code, salt);
    return { hash, salt };
  }

  async verifyCode(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
  }
}
