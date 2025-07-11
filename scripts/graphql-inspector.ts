import { GraphQLSchema } from 'graphql';

type BreakingChange = {
  loc: {
    column: number;
    line: number;
  };
  message: string;
};

export function detectBreakingChanges(
  from: GraphQLSchema,
  to: GraphQLSchema,
): BreakingChange[] {
  const breakingChanges: BreakingChange[] = [];

  const fromTypes = from.getTypeMap();
  const toTypes = to.getTypeMap();

  // Check for field removals in object types
  for (const [typeName, fromType] of Object.entries(fromTypes)) {
    const toType = toTypes[typeName];

    if (!toType) continue;

    // Check if both types are GraphQL object types
    if (
      fromType.constructor.name === 'GraphQLObjectType' &&
      toType.constructor.name === 'GraphQLObjectType'
    ) {
      const fromFields = (fromType as any).getFields();
      const toFields = (toType as any).getFields();

      for (const [fieldName, _fromField] of Object.entries(fromFields)) {
        if (!toFields[fieldName]) {
          breakingChanges.push({
            loc: {
              line: 1,
              column: 1,
            },
            message: `Field '${fieldName}' was removed from object type '${typeName}'.`,
          });
        }
      }
    }
  }

  return breakingChanges;
}
