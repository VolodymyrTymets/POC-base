---
paths:
  - "src/**/*.spec.ts"
  - "test/*.e2e-spec.ts"
---

Key points:
- PGlite runs PostgreSQL in-memory (no external database needed)
- PostGIS extension is available in tests
- Each test suite gets a fresh database via migrations
- Jest config: unit tests in `src/**/*.spec.ts`, e2e config in `test/jest-e2e.json`
## Testing Rules

- Each test should use real database data (not mocks) via the `DataCooker` utility:

```typescript
import { DataCooker } from 'test/utils/DataCooker/DataCooker';

describe('YourService', () => {
  const dataCooker = new DataCooker();
  
  beforeAll(async () => {
    await dataCooker.beforeAll(); // Runs migrations on PGlite
  });
  
  afterAll(async () => {
    await dataCooker.afterAll(); // Cleans up
  });

  it('test', async () => {
    // Your test
  });
});
```
- Use `expect` to check the result of your test
- After each test, need to remove the data from the database were inserted during the test

