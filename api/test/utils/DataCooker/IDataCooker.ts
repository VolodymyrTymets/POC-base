export interface IDataCooker {
  beforeAll(): Promise<void>;
  afterAll(): Promise<void>;
  beforeEach(): Promise<void>;
  afterEach(): Promise<void>;
}
