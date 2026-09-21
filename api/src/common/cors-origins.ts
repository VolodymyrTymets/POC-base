// The web apps (web/packages/app on :5173, web/packages/admin on :5174) call
// /graphql from a browser, which needs an explicit CORS allow-list. Ports move
// when set-ports.sh is used, hence the CORS_ORIGINS override (comma-separated).
export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
];

export const parseCorsOrigins = (raw: string | undefined): string[] => {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : DEFAULT_CORS_ORIGINS;
};
