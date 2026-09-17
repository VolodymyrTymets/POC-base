import { Test, TestingModule } from '@nestjs/testing';
import { SmsSenderService } from './sms-sender.service';

describe('SmsSenderService', () => {
  let service: SmsSenderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsSenderService],
    }).compile();

    service = module.get<SmsSenderService>(SmsSenderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
