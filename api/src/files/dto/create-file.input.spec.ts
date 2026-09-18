import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFileInput } from './create-file.input';

describe('CreateFileInput', () => {
  it('accepts a valid base64 content string', async () => {
    const input = plainToInstance(CreateFileInput, {
      name: 'test.png',
      mimeType: 'image/png',
      content: Buffer.from('hello world').toString('base64'),
    });

    const errors = await validate(input);

    expect(errors).toHaveLength(0);
  });

  it('accepts a missing content field', async () => {
    const input = plainToInstance(CreateFileInput, { name: 'test.png' });

    const errors = await validate(input);

    expect(errors).toHaveLength(0);
  });

  it('rejects a non-base64 content string', async () => {
    const input = plainToInstance(CreateFileInput, {
      name: 'test.png',
      content: 'not-base64!!!',
    });

    const errors = await validate(input);

    expect(errors.some((error) => error.property === 'content')).toBe(true);
  });
});
