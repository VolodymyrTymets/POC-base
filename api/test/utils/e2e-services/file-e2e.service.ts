import request from 'supertest';
import { type GraphQLResponseType } from './interfaces/types';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { FileEntity } from '../../../src/files/entities/file.entity';
import { CreateFileInput } from '../../../src/files/dto/create-file.input';
import { UpdateFileInput } from '../../../src/files/dto/update-file.input';

type CreateFileResponse = {
  createFile: FileEntity;
};
type UpdateFileResponse = {
  updateFile: FileEntity;
};

export class FileE2EService {
  constructor(app: INestApplication<App>) {
    this.app = app;
  }
  private readonly app: INestApplication<App>;

  private assertError<T>(
    response: GraphQLResponseType<T>,
    expectError = false,
  ) {
    if (expectError) {
      expect(response.body.errors).toBeDefined();
      return;
    }
    if (response.body.errors) {
      console.log(response.body.errors);
      console.log(response.body.errors[0].extensions?.originalError.message);
    }
    expect(response.body.errors).not.toBeDefined();
  }

  async createFileMutation(
    accessToken: string,
    input: CreateFileInput,
    expectError = false,
  ) {
    const contentArg = input.content ? `content: "${input.content}",` : '';
    const response = (await request(this.app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation {
          createFile(input: {
            name: "${input.name}",
            mimeType: "image/png",
            size: 1000000,
            ${contentArg}
          }) { id name mimeType size publicUrl }
        }`,
      })
      .expect(200)) as GraphQLResponseType<CreateFileResponse>;

    this.assertError<CreateFileResponse>(response, expectError);

    return response;
  }
  async updateFileMutation(
    accessToken: string,
    fileId: string,
    input: UpdateFileInput,
    expectError = false,
  ) {
    const contentArg = input.content ? `content: "${input.content}",` : '';
    const mimeTypeArg = input.mimeType
      ? `mimeType: "${input.mimeType}",`
      : '';
    const response = (await request(this.app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `mutation {
          updateFile(fileId: "${fileId}", input: {
            ${contentArg}
            ${mimeTypeArg}
          }) { id, publicUrl }
        }`,
      })
      .expect(200)) as GraphQLResponseType<UpdateFileResponse>;
    this.assertError<UpdateFileResponse>(response, expectError);

    return response;
  }

  async fileQuery(accessToken: string, fileId: string, expectError = false) {
    const response = (await request(this.app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `query {
          file(fileId: "${fileId}") { id, name, mimeType, size, publicUrl }
        }`,
      })
      .expect(200)) as GraphQLResponseType<{
      file: FileEntity;
    }>;

    this.assertError<{ file: FileEntity }>(response, expectError);

    return response;
  }

  /** Requests `publicUrl` through a fragment spread, not a direct field
   * selection - proves the field-selection helper in FilesResolver handles
   * fragments (see files.resolver.ts's wantsPublicUrl). */
  async fileQueryViaFragment(
    accessToken: string,
    fileId: string,
    expectError = false,
  ) {
    const response = (await request(this.app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        query: `query {
          file(fileId: "${fileId}") { id ...FileCard }
        }
        fragment FileCard on FileEntity { publicUrl }`,
      })
      .expect(200)) as GraphQLResponseType<{
      file: FileEntity;
    }>;

    this.assertError<{ file: FileEntity }>(response, expectError);

    return response;
  }
}
