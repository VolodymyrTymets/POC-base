import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { OtpCodeGeneratorService } from './otp-code-generator.service';

describe('OtpCodeGeneratorService', () => {
  let service: OtpCodeGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OtpCodeGeneratorService],
    }).compile();

    service = module.get<OtpCodeGeneratorService>(OtpCodeGeneratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCode', () => {
    it('should return a string', () => {
      const result = service.generateCode();
      expect(typeof result).toBe('string');
    });

    it('should return a 6-digit string', () => {
      const result = service.generateCode();
      expect(result.length).toBe(6);
    });

    it('should return only digit characters', () => {
      const result = service.generateCode();
      expect(/^\d+$/.test(result)).toBe(true);
    });

    it('should return a value within [100000, 999999]', () => {
      const result = service.generateCode();
      const value = parseInt(result, 10);
      expect(value).toBeGreaterThanOrEqual(100000);
      expect(value).toBeLessThanOrEqual(999999);
    });

    it('should produce different values across multiple calls', () => {
      const codes = new Set(
        Array.from({ length: 10 }, () => service.generateCode()),
      );
      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('hashCode', () => {
    it('should return an object with hash and salt properties', async () => {
      const result = await service.hashCode('123456');
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('salt');
      expect(typeof result.hash).toBe('string');
      expect(typeof result.salt).toBe('string');
    });

    it('should return non-empty hash and salt strings', async () => {
      const result = await service.hashCode('123456');
      expect(result.hash.length).toBeGreaterThan(0);
      expect(result.salt.length).toBeGreaterThan(0);
    });

    it('should return a valid bcrypt hash', async () => {
      const result = await service.hashCode('123456');
      expect(result.hash.startsWith('$2b$')).toBe(true);
    });

    it('should return a salt that is a prefix of the hash', async () => {
      const result = await service.hashCode('123456');
      expect(result.hash.startsWith(result.salt)).toBe(true);
    });

    it('should produce a hash that verifies correctly against the original code', async () => {
      const code = '123456';
      const result = await service.hashCode(code);
      const isValid = await bcrypt.compare(code, result.hash);
      expect(isValid).toBe(true);
    });

    it('should produce different hashes for the same code on repeated calls', async () => {
      const code = '123456';
      const result1 = await service.hashCode(code);
      const result2 = await service.hashCode(code);
      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe('verifyCode', () => {
    it('should return true when the code matches the hash', async () => {
      const code = '654321';
      const { hash } = await service.hashCode(code);
      const result = await service.verifyCode(code, hash);
      expect(result).toBe(true);
    });

    it('should return false when the code does not match the hash', async () => {
      const code = '654321';
      const { hash } = await service.hashCode(code);
      const result = await service.verifyCode('000000', hash);
      expect(result).toBe(false);
    });

    it('should return false for an empty string code', async () => {
      const code = '654321';
      const { hash } = await service.hashCode(code);
      const result = await service.verifyCode('', hash);
      expect(result).toBe(false);
    });

    it('should return false when hash is from a different code', async () => {
      const hash1 = await service.hashCode('111111');
      const hash2 = await service.hashCode('222222');
      const result = await service.verifyCode('111111', hash2.hash);
      expect(result).toBe(false);
    });
  });
});
