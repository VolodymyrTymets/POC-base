import { set } from 'lodash';
import { PaginationInput } from './input/pagination.input';
import { SortingInput } from './input/sorting.input';

enum SortDirection {
  asc = 'asc',
  desc = 'desc',
}
type Order = Record<string, Record<string, SortDirection> | SortDirection>;

export const transformSort = (
  sort: SortingInput[],
  parser?: (field: string, orderOrderDirection, orderByField: Order) => any,
): Record<string, SortDirection>[] => {
  return sort.reduce((acc, { field, order }) => {
    const orderByField = set({}, field, order);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    acc.push(parser ? parser(field, order, orderByField) : orderByField);
    return acc;
  }, []);
};

export const transformPagination = (pagination: PaginationInput) => {
  const { skip, take } = pagination;

  return { skip, ...(take ? { take } : {}) };
};

export const transformFullTextSearch = (slug: string) => {
  return (
    slug &&
    slug
      .trimStart()
      .trimEnd()
      .split(' ')
      .map((word) => `${word}`)
      .join(' | ')
      .concat(':*')
  );
};
