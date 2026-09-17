export type GraphQLResponseType<T> = {
  body: {
    data: T;
    errors?: Array<{
      message: string;
      extensions: {
        code: string;
        message: string;
        originalError: { message: string };
      };
    }>;
  };
};
