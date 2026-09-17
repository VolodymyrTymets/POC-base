import { GraphQLResolveInfo, SelectionNode } from 'graphql';

export interface SelectInclude {
  select?: Include;
  include?: Include;
}

type Include = Record<string, boolean | SelectInclude>;

export class GraphToPrisma<T = Include> {
  private info: GraphQLResolveInfo;
  public include?: T;
  private excludeFields: string[] = [];
  private readonly fragments: Record<string, Include>;

  constructor(
    info: GraphQLResolveInfo,
    params: { excludeFields?: string[] } = {},
  ) {
    this.excludeFields = params.excludeFields || ['__typename'];
    this.info = info;
    this.fragments = this.getFragments();
    this.include = info
      ? (this.transformPrismaIncludeFromQuery(info) as unknown as T)
      : undefined;
  }

  private getFragments(): Record<string, Include> {
    return Object.entries(this.info.fragments).reduce<Record<string, Include>>(
      (acc, [fragmentName, fragmentData]) => {
        acc[fragmentName] = this.transformSelections(
          fragmentData.selectionSet.selections,
        );
        return acc;
      },
      {},
    );
  }

  private getFragmentNameToTypeMap(): Record<string, string> {
    return Object.keys(this.fragments).reduce<Record<string, string>>(
      (acc, fragmentName) => {
        acc[fragmentName] =
          this.info.fragments[fragmentName].typeCondition.name.value;
        return acc;
      },
      {},
    );
  }

  private selectOrInclude(selections: Include = {}): true | SelectInclude {
    const values = Object.values(selections);
    if (!values.length) {
      return true;
    }
    return values.some((v) => typeof v === 'boolean')
      ? { select: selections }
      : { include: selections };
  }

  private transformSelections(
    selections?: readonly SelectionNode[],
    parent?: string,
  ): Include {
    return (
      selections?.reduce<Include>((acc, selection) => {
        if (selection.kind === 'Field') {
          const { name, selectionSet } = selection;
          const { value } = name;
          if (this.excludeFields.includes(value)) {
            return acc;
          }
          acc[value] = this.selectOrInclude(
            this.transformSelections(selectionSet?.selections, value),
          );
        } else if (selection.kind === 'FragmentSpread') {
          const { name } = selection;
          const { value } = name;
          const fragmentSpreadFields = this.transformSelections(
            this.info.fragments[value].selectionSet.selections,
          );
          if (fragmentSpreadFields) {
            acc = { ...acc, ...fragmentSpreadFields };
          }
        }
        return acc;
      }, {}) ?? {}
    );
  }

  private transformPrismaIncludeFromQuery(info: GraphQLResolveInfo): Include {
    return this.transformSelections(
      info?.fieldNodes[0]?.selectionSet?.selections,
    );
  }
}

export const getPrismaIncludeFromGqInfo = (
  info?: GraphQLResolveInfo,
): Include | undefined => {
  if (!info) {
    return undefined;
  }
  const graphToPrisma = new GraphToPrisma(info);
  return graphToPrisma.include && graphToPrisma.include;
};
