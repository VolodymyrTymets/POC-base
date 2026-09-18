import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DataCooker } from '../utils/DataCooker/DataCooker';
import { SignInService } from '../utils/e2e-services/sign-in.service';
import { FileStatus } from '../../generated/prisma/enums';
import { FileE2EService } from '../utils/e2e-services/file-e2e.service';
import { PrismaAdapterMockFactory } from '../utils/mock-services/prisma.adapter.factory';
import { PrismaAdapterFactory } from '../../src/prisma/prisma.adapter.factory';

describe('Upload file (e2e)', () => {
  let app: INestApplication<App>;
  let signInService: SignInService;
  let fileE2EService: FileE2EService;
  const dataCooker = new DataCooker();

  beforeAll(async () => {
    await dataCooker.beforeAll();
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaAdapterFactory)
      .useValue(new PrismaAdapterMockFactory(dataCooker.getPgLitle()))
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    signInService = new SignInService(app);
    fileE2EService = new FileE2EService(app);
  });

  it('Should create new file without content', async () => {
    const phoneNumber = '+12125551231';
    const fileName = 'test.png';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const response = await fileE2EService.createFileMutation(accessToken, {
      name: fileName,
    });
    const file = response.body.data.createFile;
    expect(file).toBeDefined();
    expect(file.id).toBeDefined();
    expect(file.name).toEqual(fileName);
    expect(file.mimeType).toEqual('image/png');
    expect(file.size).toEqual(1000000);
    expect(file.status).toEqual(FileStatus.FILE_STATUS_CREATED);
    expect(file.publicUrl).toBeNull();
  });

  it('Should create new file with content, resolving publicUrl to a data URI', async () => {
    const phoneNumber = '+12125551231';
    const fileName = 'test-with-content.png';
    const content = Buffer.from('hello file storage').toString('base64');
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const response = await fileE2EService.createFileMutation(accessToken, {
      name: fileName,
      content,
    });
    const file = response.body.data.createFile;
    expect(file).toBeDefined();
    expect(file.status).toEqual(FileStatus.FILE_STATUS_UPLOAD_COMPLETED);
    expect(file.publicUrl).toEqual(`data:image/png;base64,${content}`);
  });

  it('Should update file, attaching content on a second call', async () => {
    const phoneNumber = '+12125551231';
    const fileName = 'test1.png';
    const content = Buffer.from('attached later').toString('base64');
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const response = await fileE2EService.createFileMutation(accessToken, {
      name: fileName,
    });
    const file = response.body.data.createFile;
    expect(file).toBeDefined();
    expect(file.id).toBeDefined();

    const uploadingResponse = await fileE2EService.updateFileMutation(
      accessToken,
      file.id,
      {
        status: FileStatus.FILE_STATUS_UPLOAD_IN_PROGRESS,
      },
    );
    const file2 = uploadingResponse.body.data.updateFile;
    expect(file2).toBeDefined();
    expect(file2.id).toEqual(file.id);
    expect(file2.status).toEqual(FileStatus.FILE_STATUS_UPLOAD_IN_PROGRESS);

    const uploadingResponse1 = await fileE2EService.updateFileMutation(
      accessToken,
      file.id,
      {
        status: FileStatus.FILE_STATUS_UPLOAD_COMPLETED,
        content,
      },
    );
    const file3 = uploadingResponse1.body.data.updateFile;
    expect(file3).toBeDefined();
    expect(file3.id).toEqual(file.id);
    expect(file3.status).toEqual(FileStatus.FILE_STATUS_UPLOAD_COMPLETED);
    expect(file3.publicUrl).toEqual(`data:image/png;base64,${content}`);
  });

  it('Should get file by id', async () => {
    const phoneNumber = '+12125551231';
    const fileName = 'test3.png';
    const { accessToken } = await signInService.signInOtp(phoneNumber);
    const response = await fileE2EService.createFileMutation(accessToken, {
      name: fileName,
    });
    const file = response.body.data.createFile;
    expect(file).toBeDefined();
    expect(file.id).toBeDefined();

    const fileByIdResponse = await fileE2EService.fileQuery(
      accessToken,
      file.id,
    );
    const fileById = fileByIdResponse.body.data.file || {};
    expect(fileById).toBeDefined();
    expect(fileById.id).toEqual(file.id);
  });

  it('Should"t update file of another user ', async () => {
    const phoneNumber1 = '+12125551231';
    const phoneNumber2 = '+12125551232';
    const fileName = 'test3.png';
    const { accessToken: accessToken1 } =
      await signInService.signInOtp(phoneNumber1);
    const { accessToken: accessToken2 } =
      await signInService.signInOtp(phoneNumber2);
    const response = await fileE2EService.createFileMutation(accessToken1, {
      name: fileName,
    });
    const file = response.body.data.createFile;
    expect(file).toBeDefined();
    expect(file.id).toBeDefined();

    const uploadingResponse = await fileE2EService.updateFileMutation(
      accessToken2,
      file.id,
      {
        status: FileStatus.FILE_STATUS_UPLOAD_IN_PROGRESS,
      },
      true,
    );
    expect(uploadingResponse.body.errors).toBeDefined();
    expect(uploadingResponse.body.errors[0].extensions.code).toEqual(
      'FORBIDDEN',
    );
  });
  it('Should"t have access to another user file ', async () => {
    const phoneNumber1 = '+12125551231';
    const phoneNumber2 = '+12125551232';
    const fileName = 'test3.png';
    const { accessToken: accessToken1 } =
      await signInService.signInOtp(phoneNumber1);
    const { accessToken: accessToken2 } =
      await signInService.signInOtp(phoneNumber2);
    const response = await fileE2EService.createFileMutation(accessToken1, {
      name: fileName,
    });
    const file = response.body.data.createFile;
    expect(file).toBeDefined();
    expect(file.id).toBeDefined();

    const uploadingResponse = await fileE2EService.fileQuery(
      accessToken2,
      file.id,
      true,
    );
    expect(uploadingResponse.body.errors).toBeDefined();
    expect(uploadingResponse.body.errors[0].extensions.code).toEqual(
      'FORBIDDEN',
    );
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    if (dataCooker) {
      await dataCooker.afterAll();
    }
  });
});
