import * as Sentry from '@sentry/nestjs';
import 'dotenv/config';

/**
 * Read more:
 * - https://docs.sentry.io/platforms/javascript/guides/nestjs/
 *  */
const dsn = `https://${process.env.SENTRY_PUBLIC_KEY}@${process.env.SENTRY_ORGANIZATION_ID}.ingest.de.sentry.io/${process.env.SENTRY_PROJECT_ID}`;
// Ensure to call this before requiring any other modules!
Sentry.init({
  dsn,
  enabled: process.env.NODE_ENV !== 'local',
  environment: process.env.NODE_ENV,
});