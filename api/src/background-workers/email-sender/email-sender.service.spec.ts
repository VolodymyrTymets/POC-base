import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSenderService } from './email-sender.service';
import { Events } from './email.queue.constants';

describe('EmailSenderService', () => {
  let emailSenderService: EmailSenderService;
  let environment: string | undefined;
  let logSpy: jest.SpyInstance;

  const message = {
    accountId: 'account-1',
    email: 'reset.me@example.com',
    token: 'secret-reset-token',
  };
  const loggedText = () =>
    logSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailSenderService,
        // NODE_ENV is process-wide under jest, so the config edge is stubbed
        { provide: ConfigService, useValue: { get: () => environment } },
      ],
    }).compile();
    emailSenderService = module.get(EmailSenderService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it.each(['local', 'development', 'test'])(
    'logs the recipient and token in %s so the flow can be finished by hand',
    async (env) => {
      environment = env;

      await emailSenderService.process({
        name: Events.PasswordResetMessage,
        data: message,
      });

      expect(loggedText()).toContain(message.email);
      expect(loggedText()).toContain(message.token);
    },
  );

  it('logs only the account id, never the email or token, in production', async () => {
    environment = 'production';

    await emailSenderService.process({
      name: Events.PasswordResetMessage,
      data: message,
    });

    expect(loggedText()).toContain(message.accountId);
    expect(loggedText()).not.toContain(message.email);
    expect(loggedText()).not.toContain(message.token);
  });

  it('logs nothing for a job name it does not handle', async () => {
    environment = 'test';

    await emailSenderService.process({ name: 'SomethingElse', data: message });

    expect(logSpy).not.toHaveBeenCalled();
  });
});
