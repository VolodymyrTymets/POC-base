import DataLoader from 'dataloader';

// todo: think about it Maybe make it static
/**
 * A base class for resolve N + 1 queries problem with DataLoader
 * @example
 * 1. Import DataLoaderResolver
 * 2. Extend it in your resolver class
 * 3. Create a DataLoader instance in your resolver class
 *  private commentsLoader = this.createDataLoader<Comment>({
 *     getResults: async (ids: readonly string[]) =>
 *       await this.authService.comments(ids),
 *     keyKey: 'commentId',
 *   });
 * 4. Use the DataLoader instance in your resolver methods
 * 5. Trigger the loader
 *  @ResolveField(() => [Comment])
 *   async comments(@Parent() post: Post) {
 *     return this.commentsLoader.load(post.id);
 *   }
 */
export class DataLoaderResolver {
  constructor() {}

  private batchFunction<T>({
    getResults,
    keyKey,
  }: {
    getResults: (ids: readonly string[]) => Promise<T[]>;
    keyKey: string;
  }): (ids: readonly string[]) => Promise<Record<string, T[]>[string][]> {
    return async (ids: readonly string[]) => {
      // 2. Fetch all records matching any of the ids in ONE query
      const allRecords = await getResults(ids);
      // 3. Group the records by postId
      const mapRecords: Record<string, T[]> = {};
      allRecords.forEach((record) => {
        const key = record[keyKey] as string;
        if (!mapRecords[key]) {
          mapRecords[key] = [];
        }
        mapRecords[key].push(record);
      });

      // 4. CRITICAL: Return arrays in the EXACT same order as the requested ids
      return ids.map((id) => mapRecords[id] || []);
    };
  }

  createDataLoader<T>({
    getResults,
    keyKey,
  }: {
    getResults: (ids: readonly string[]) => Promise<T[]>;
    keyKey: string;
  }): DataLoader<string, T[]> {
    return new DataLoader<string, T[]>(
      this.batchFunction({ getResults, keyKey }),
    );
  }
}
