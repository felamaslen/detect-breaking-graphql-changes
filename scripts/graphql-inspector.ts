import {
  type ASTNode,
  type DirectiveNode,
  type GraphQLNamedType,
  type GraphQLSchema,
  type GraphQLType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isIntrospectionType,
  isListType,
  isNamedType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isSpecifiedScalarType,
  isUnionType,
} from 'graphql';

export type BreakingChangeType =
  | 'FIELD_CHANGED_KIND'
  | 'FIELD_REMOVED'
  | 'INPUT_FIELD_BECAME_REQUIRED'
  | 'TYPE_CHANGED_KIND'
  | 'TYPE_REMOVED'
  | 'TYPE_REMOVED_FROM_UNION'
  | 'VALUE_REMOVED_FROM_ENUM'
  | 'ARG_REMOVED'
  | 'ARG_CHANGED_KIND'
  | 'ARG_BECAME_REQUIRED'
  | 'REQUIRED_ARG_ADDED'
  | 'REQUIRED_INPUT_FIELD_ADDED'
  | 'INTERFACE_REMOVED_FROM_OBJECT'
  | 'DIRECTIVE_REMOVED'
  | 'DIRECTIVE_ARG_REMOVED'
  | 'DIRECTIVE_ARG_CHANGED_TYPE'
  | 'DIRECTIVE_LOCATION_REMOVED'
  | 'REQUIRED_DIRECTIVE_ARG_ADDED';

type DangerousChangeType =
  | 'ARG_DEFAULT_VALUE_CHANGE'
  | 'VALUE_ADDED_TO_ENUM'
  | 'INTERFACE_ADDED_TO_OBJECT'
  | 'TYPE_ADDED_TO_UNION'
  | 'OPTIONAL_INPUT_FIELD_ADDED'
  | 'OPTIONAL_ARG_ADDED';

interface Change {
  appliesOnlyToSchema?: boolean;
  loc: `${number}:${number}`;
  message: string;
  resourceName: string;
  wasDeprecated: boolean;
  wasNotImplemented: boolean;
  wasRequiredByDirective?: boolean;
}

export interface BreakingChange extends Change {
  type: BreakingChangeType;
}

export interface DangerousChange extends Change {
  type: DangerousChangeType;
}

const getLocation = (
  astNode: ASTNode | null | undefined,
): `${number}:${number}` =>
  `${astNode?.loc?.startToken.line ?? 0}:${astNode?.loc?.endToken.column ?? 0}`;

const isDeprecated = <Node extends { directives?: readonly DirectiveNode[] }>(
  node: Node | null | undefined,
) =>
  !!node?.directives?.some(directive => directive.name.value === 'deprecated');

const isNotImplemented = <
  Node extends { directives?: readonly DirectiveNode[] },
>(
  node: Node | null | undefined,
) =>
  !!node?.directives?.some(
    directive => directive.name.value === 'notImplemented',
  );

/**
 * Given two schemas, returns an Array containing descriptions of any breaking
 * changes in the newSchema related to removing an entire type.
 */
function findRemovedTypes(
  oldSchema: GraphQLSchema,
  newSchema: GraphQLSchema,
): BreakingChange[] {
  const oldTypeMap = oldSchema.getTypeMap();
  const newTypeMap = newSchema.getTypeMap();

  const breakingChanges: BreakingChange[] = [];
  for (const typeName of Object.keys(oldTypeMap)) {
    const oldType = oldTypeMap[typeName];

    // Skip built-in types, introspection types, and specified scalar types
    if (
      isIntrospectionType(oldType) ||
      isSpecifiedScalarType(oldType) ||
      typeName.startsWith('__')
    ) {
      continue;
    }

    if (!newTypeMap[typeName]) {
      breakingChanges.push({
        loc: getLocation(oldType.astNode),
        message: `\`${typeName}\` removed from schema`,
        resourceName: typeName,
        type: 'TYPE_REMOVED',
        wasDeprecated: isDeprecated(oldType.astNode),
        wasNotImplemented: isNotImplemented(oldType.astNode),
      });
    }
  }
  return breakingChanges;
}

/**
 * Given two schemas, returns an Array containing descriptions of any breaking
 * changes in the newSchema related to changing the type of a type.
 */
function findTypesThatChangedKind(
  oldSchema: GraphQLSchema,
  newSchema: GraphQLSchema,
): BreakingChange[] {
  const oldTypeMap = oldSchema.getTypeMap();
  const newTypeMap = newSchema.getTypeMap();

  const breakingChanges: BreakingChange[] = [];
  for (const typeName of Object.keys(oldTypeMap)) {
    if (!newTypeMap[typeName]) {
      continue;
    }
    const oldType = oldTypeMap[typeName];
    const newType = newTypeMap[typeName];
    if (oldType.constructor !== newType.constructor) {
      breakingChanges.push({
        loc: getLocation(newType.astNode),
        message: `\`${typeName}\` changed from ${typeKindName(
          oldType,
        )} to ${typeKindName(newType)}`,
        resourceName: typeName,
        type: 'TYPE_CHANGED_KIND',
        wasDeprecated: isDeprecated(oldType.astNode),
        wasNotImplemented: isNotImplemented(oldType.astNode),
      });
    }
  }
  return breakingChanges;
}

function typeKindName(type: GraphQLNamedType): string {
  if (isScalarType(type)) {
    return 'a Scalar type';
  }
  if (isObjectType(type)) {
    return 'an Object type';
  }
  if (isInterfaceType(type)) {
    return 'an Interface type';
  }
  if (isUnionType(type)) {
    return 'a Union type';
  }
  if (isEnumType(type)) {
    return 'an Enum type';
  }
  if (isInputObjectType(type)) {
    return 'an Input type';
  }
  throw new TypeError(
    `Unknown type ${
      (type as { constructor: { name: string } }).constructor.name
    }`,
  );
}

function findFieldsThatChangedTypeOnObjectOrInterfaceTypes(
  oldSchema: GraphQLSchema,
  newSchema: GraphQLSchema,
): BreakingChange[] {
  const oldTypeMap = oldSchema.getTypeMap();
  const newTypeMap = newSchema.getTypeMap();

  const breakingChanges: BreakingChange[] = [];
  for (const typeName of Object.keys(oldTypeMap)) {
    const oldType = oldTypeMap[typeName];
    const newType = newTypeMap[typeName];
    if (
      !(isObjectType(oldType) || isInterfaceType(oldType)) ||
      !(isObjectType(newType) || isInterfaceType(newType)) ||
      newType.constructor !== oldType.constructor
    ) {
      continue;
    }

    const oldTypeFieldsDef = oldType.getFields();
    const newTypeFieldsDef = newType.getFields();
    for (const fieldName of Object.keys(oldTypeFieldsDef)) {
      // Check if the field is missing on the type in the new schema.
      if (!(fieldName in newTypeFieldsDef)) {
        breakingChanges.push({
          loc: getLocation(oldTypeFieldsDef[fieldName].astNode),
          resourceName: `${typeName}.${fieldName}`,
          type: 'FIELD_REMOVED',
          message: `\`${typeName}.${fieldName}\` removed from schema`,
          wasDeprecated: isDeprecated(oldTypeFieldsDef[fieldName].astNode),
          wasNotImplemented: isNotImplemented(
            oldTypeFieldsDef[fieldName].astNode,
          ),
        });
      } else {
        const oldFieldType = oldTypeFieldsDef[fieldName].type;
        const newFieldType = newTypeFieldsDef[fieldName].type;
        const isSafe = isChangeSafeForObjectOrInterfaceField(
          oldFieldType,
          newFieldType,
        );
        if (!isSafe) {
          const oldFieldTypeString = isNamedType(oldFieldType)
            ? oldFieldType.name
            : oldFieldType.toString();
          const newFieldTypeString = isNamedType(newFieldType)
            ? newFieldType.name
            : newFieldType.toString();
          breakingChanges.push({
            loc: getLocation(newTypeFieldsDef[fieldName].astNode),
            message: `Field \`${typeName}.${fieldName}\` changed type from \`${oldFieldTypeString}\` to \`${newFieldTypeString}\``,
            resourceName: `${typeName}.${fieldName}`,
            type: 'FIELD_CHANGED_KIND',
            wasDeprecated: isDeprecated(oldTypeFieldsDef[fieldName].astNode),
            wasNotImplemented: isNotImplemented(
              oldTypeFieldsDef[fieldName].astNode,
            ),
          });
        }
      }
    }
  }
  return breakingChanges;
}

function isChangeSafeForObjectOrInterfaceField(
  oldType: GraphQLType,
  newType: GraphQLType,
): boolean {
  if (isListType(oldType)) {
    return (
      // if they're both lists, make sure the underlying types are compatible
      (isListType(newType) &&
        isChangeSafeForObjectOrInterfaceField(
          oldType.ofType,
          newType.ofType,
        )) ||
      // moving from nullable to non-null of the same underlying type is safe
      (isNonNullType(newType) &&
        isChangeSafeForObjectOrInterfaceField(oldType, newType.ofType))
    );
  }
  if (isNonNullType(oldType)) {
    // if they're both non-null, make sure the underlying types are compatible
    return (
      isNonNullType(newType) &&
      isChangeSafeForObjectOrInterfaceField(oldType.ofType, newType.ofType)
    );
  }
  if (isNamedType(oldType)) {
    return (
      // if they're both named types, see if their names are equivalent
      (isNamedType(newType) && oldType.name === newType.name) ||
      // moving from nullable to non-null of the same underlying type is safe
      (isNonNullType(newType) &&
        isChangeSafeForObjectOrInterfaceField(oldType, newType.ofType))
    );
  }
  return false;
}

/**
 * Detect dangerous and breaking changes from one version of a GraphQL schema to another
 */
export function detectBreakingChanges(
  from: GraphQLSchema,
  to: GraphQLSchema,
): BreakingChange[] {
  return [
    ...findRemovedTypes(from, to),
    ...findTypesThatChangedKind(from, to),
    ...findFieldsThatChangedTypeOnObjectOrInterfaceTypes(from, to),
  ].filter(changes => !changes.wasNotImplemented);
}
