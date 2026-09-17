import { Module } from '@nestjs/common';
import { SmsSenderService } from './sms-sender.service';
@Module({
  imports: [],
  providers: [SmsSenderService],
})
export class SmsSenderModule {
  constructor() {
    console.log(`[SMS] Module is running...`);
    console.debug(
      'REDIS_HOST: ',
      process.env.REDIS_HOST,
      ' REDIS_PORT: ',
      process.env.REDIS_PORT,
      '',
    );
  }
}
