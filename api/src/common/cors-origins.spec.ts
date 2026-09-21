import { DEFAULT_CORS_ORIGINS, parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('falls back to the local web app origins when the variable is unset', () => {
    expect(parseCorsOrigins(undefined)).toEqual(DEFAULT_CORS_ORIGINS);
  });

  it('falls back to the defaults for an empty or blank value', () => {
    expect(parseCorsOrigins('')).toEqual(DEFAULT_CORS_ORIGINS);
    expect(parseCorsOrigins(' , ')).toEqual(DEFAULT_CORS_ORIGINS);
  });

  it('splits on commas and trims whitespace', () => {
    expect(
      parseCorsOrigins(' http://localhost:4000 , https://app.example.com '),
    ).toEqual(['http://localhost:4000', 'https://app.example.com']);
  });

  it('replaces the defaults instead of extending them', () => {
    expect(parseCorsOrigins('http://localhost:4000')).toEqual([
      'http://localhost:4000',
    ]);
  });
});
