import {
  type ASTNode,
  type DirectiveNode,
  type GraphQLFieldMap,
  type GraphQLInterfaceType,
  type GraphQLNamedType,
  type GraphQLObjectType,
  type GraphQLSchema,
  type GraphQLType,
  buildSchema,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isIntrospectionType,
  isListType,
  isNamedType,
  isNonNullType,
  isObjectType,
  isRequiredArgument,
  isScalarType,
  isSpecifiedScalarType,
  isUnionType,
} from 'graphql';

type BreakingChangeType =
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
  loc: `${number}:${number}` | undefined;
  message: string;
  resourceName: string;
  wasDeprecated: boolean;
  wasRequiredByDirective?: boolean;
}

interface BreakingChange extends Change {
  type: BreakingChangeType;
}

interface DangerousChange extends Change {
  type: DangerousChangeType;
}

const getLocation = (
  astNode: ASTNode | null | undefined,
): `${number}:${number}` =>
  `${astNode?.loc?.startToken.line ?? 0}:${astNode?.loc?.endToken.column ?? 0}`;

const isDeprecated = <Node extends { directives?: readonly DirectiveNode[] }>(
  node: Node | null | undefined,
) =>
  !!node?.directives?.some(
    (directive) => directive.name.value === 'deprecated',
  );

/**
 * Deep equality comparison for default values
 */
function isDefaultValueEqual(oldValue: any, newValue: any): boolean {
  if (oldValue === newValue) return true;
  if (oldValue == null || newValue == null) return false;
  if (typeof oldValue !== typeof newValue) return false;
  if (Array.isArray(oldValue) && Array.isArray(newValue))
    return (
      oldValue.length === newValue.length &&
      oldValue.every((item, index) =>
        isDefaultValueEqual(item, newValue[index]),
      )
    );
  if (typeof oldValue === 'object' && typeof newValue === 'object') {
    const oldKeys = Object.keys(oldValue);
    const newKeys = Object.keys(newValue);
    return (
      oldKeys.length === newKeys.length &&
      oldKeys.every(
        (key) =>
          newKeys.includes(key) &&
          isDefaultValueEqual(oldValue[key], newValue[key]),
      )
    );
  }
  return false;
}

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
        loc: undefined,
        message: `\`${typeName}\` removed from schema`,
        resourceName: typeName,
        type: 'TYPE_REMOVED',
        wasDeprecated: isDeprecated(oldType.astNode),
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
      if (
        (isObjectType(oldType) && isInterfaceType(newType)) ||
        (isInterfaceType(oldType) && isObjectType(newType))
      ) {
        breakingChanges.push(
          ...findFieldsThatChangedTypeOnObjectOrInterfaceType(
            typeName,
            oldType,
            newType,
          ),
        );
      } else {
        breakingChanges.push({
          loc: getLocation(newType.astNode),
          message: `\`${typeName}\` changed from ${typeKindName(
            oldType,
          )} to ${typeKindName(newType)}`,
          resourceName: typeName,
          type: 'TYPE_CHANGED_KIND',
          wasDeprecated: isDeprecated(oldType.astNode),
        });
      }
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

function findFieldsThatChangedTypeOnObjectOrInterfaceType(
  typeName: string,
  oldType: GraphQLObjectType | GraphQLInterfaceType,
  newType: GraphQLObjectType | GraphQLInterfaceType,
): BreakingChange[] {
  const breakingChanges: BreakingChange[] = [];

  const oldTypeFieldsDef = oldType.getFields();
  const newTypeFieldsDef = newType.getFields();
  for (const fieldName of Object.keys(oldTypeFieldsDef)) {
    // Check if the field is missing on the type in the new schema.
    if (!(fieldName in newTypeFieldsDef)) {
      breakingChanges.push({
        loc: getLocation(newType.astNode),
        resourceName: `${typeName}.${fieldName}`,
        type: 'FIELD_REMOVED',
        message: `\`${typeName}.${fieldName}\` removed from schema`,
        wasDeprecated: isDeprecated(oldTypeFieldsDef[fieldName].astNode),
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
        });
      }
    }
  }

  return breakingChanges;
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

    breakingChanges.push(
      ...findFieldsThatChangedTypeOnObjectOrInterfaceType(
        typeName,
        oldType,
        newType,
      ),
    );
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

function isChangeSafeForInputObjectFieldOrFieldArg(
  oldType: GraphQLType,
  newType: GraphQLType,
): boolean {
  if (isListType(oldType)) {
    // if they're both lists, make sure the underlying types are compatible
    return (
      isListType(newType) &&
      isChangeSafeForInputObjectFieldOrFieldArg(oldType.ofType, newType.ofType)
    );
  }
  if (isNonNullType(oldType)) {
    return (
      // if they're both non-null, make sure the underlying types are
      // compatible
      (isNonNullType(newType) &&
        isChangeSafeForInputObjectFieldOrFieldArg(
          oldType.ofType,
          newType.ofType,
        )) ||
      // moving from non-null to nullable of the same underlying type is safe
      (!isNonNullType(newType) &&
        isChangeSafeForInputObjectFieldOrFieldArg(oldType.ofType, newType))
    );
  }
  if (isNamedType(oldType)) {
    // if they're both named types, see if their names are equivalent
    return isNamedType(newType) && oldType.name === newType.name;
  }
  return false;
}

/**
 * Given two schemas, returns an Array containing descriptions of any
 * breaking or dangerous changes in the newSchema related to arguments
 * (such as removal or change of type of an argument, or a change in an
 * argument's default value).
 */
function findArgChanges(
  oldSchema: GraphQLSchema,
  newSchema: GraphQLSchema,
): {
  breakingChanges: BreakingChange[];
  dangerousChanges: DangerousChange[];
} {
  const oldTypeMap = oldSchema.getTypeMap();
  const newTypeMap = newSchema.getTypeMap();

  const breakingChanges: BreakingChange[] = [];
  const dangerousChanges: DangerousChange[] = [];

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

    const oldTypeFields: GraphQLFieldMap<any, any> = oldType.getFields();
    const newTypeFields: GraphQLFieldMap<any, any> = newType.getFields();

    for (const fieldName of Object.keys(oldTypeFields)) {
      if (!newTypeFields[fieldName]) {
        continue;
      }

      for (const oldArgDef of oldTypeFields[fieldName].args) {
        const newArgs = newTypeFields[fieldName].args;
        const newArgDef = newArgs.find((arg) => arg.name === oldArgDef.name);

        // Arg not present
        if (!newArgDef) {
          breakingChanges.push({
            loc: getLocation(newTypeFields[fieldName].astNode),
            message: `\`${oldType.name}.${fieldName}\` arg \`${oldArgDef.name}\` removed from schema`,
            resourceName: `${fieldName}.${oldArgDef.name}`,
            type: 'ARG_REMOVED',
            wasDeprecated: isDeprecated(oldArgDef.astNode),
          });
        } else {
          const isSafe = isChangeSafeForInputObjectFieldOrFieldArg(
            oldArgDef.type,
            newArgDef.type,
          );
          if (!isSafe) {
            const becameRequired =
              oldArgDef.name === newArgDef.name &&
              isNonNullType(newArgDef.type) &&
              !isNonNullType(oldArgDef.type);

            const wasRequiredByDirective =
              oldArgDef.astNode?.directives?.some(
                (directive) => directive.name.value === 'required',
              ) ?? undefined;

            breakingChanges.push({
              loc: getLocation(newArgDef.astNode),
              message: `\`${oldType.name}.${fieldName}\` arg \`${
                oldArgDef.name
              }\` changed type from \`${oldArgDef.type.toString()}\` to \`${newArgDef.type.toString()}\``,
              resourceName: `${fieldName}.${oldArgDef.name}`,
              type: becameRequired ? 'ARG_BECAME_REQUIRED' : 'ARG_CHANGED_KIND',
              wasDeprecated: isDeprecated(oldArgDef.astNode),
              wasRequiredByDirective,
            });
          } else if (
            oldArgDef.defaultValue !== undefined &&
            !isDefaultValueEqual(oldArgDef.defaultValue, newArgDef.defaultValue)
          ) {
            dangerousChanges.push({
              loc: getLocation(newArgDef.astNode),
              resourceName: `${fieldName}.${oldArgDef.name}`,
              type: 'ARG_DEFAULT_VALUE_CHANGE',
              message: `\`${oldType.name}.${fieldName}\` arg \`${oldArgDef.name}\` has changed defaultValue`,
              wasDeprecated: isDeprecated(oldType.astNode),
            });
          }
        }
      }
      // Check if arg was added to the field
      for (const newArgDef of newTypeFields[fieldName].args) {
        const oldArgs = oldTypeFields[fieldName].args;
        const oldArgDef = oldArgs.find((arg) => arg.name === newArgDef.name);
        if (!oldArgDef) {
          const argName = newArgDef.name;

          if (isRequiredArgument(newArgDef)) {
            breakingChanges.push({
              loc: getLocation(newArgDef.astNode),
              resourceName: `${typeName}.${fieldName}`,
              type: 'REQUIRED_ARG_ADDED',
              message: `A required arg \`${argName}\` on \`${typeName}.${fieldName}\` was added`,
              wasDeprecated: isDeprecated(oldTypeFields[fieldName].astNode),
            });
          } else {
            dangerousChanges.push({
              loc: getLocation(newArgDef.astNode),
              resourceName: `${typeName}.${fieldName}`,
              type: 'OPTIONAL_ARG_ADDED',
              message: `An optional arg \`${argName}\` on \`${typeName}.${fieldName}\` was added`,
              wasDeprecated: isDeprecated(oldTypeFields[fieldName].astNode),
            });
          }
        }
      }
    }
  }

  return {
    breakingChanges,
    dangerousChanges,
  };
}

/**
 * Given two schemas, returns an Array containing descriptions of any breaking
 * changes in the newSchema related to removing values from an enum type.
 */
function findValuesRemovedFromEnums(
  oldSchema: GraphQLSchema,
  newSchema: GraphQLSchema,
): BreakingChange[] {
  const oldTypeMap = oldSchema.getTypeMap();
  const newTypeMap = newSchema.getTypeMap();

  const valuesRemovedFromEnums: BreakingChange[] = [];
  for (const typeName of Object.keys(oldTypeMap)) {
    const oldType = oldTypeMap[typeName];
    const newType = newTypeMap[typeName];
    if (!isEnumType(oldType) || !isEnumType(newType)) {
      continue;
    }
    const valuesInNewEnum = Object.create(null);
    for (const value of newType.getValues()) {
      valuesInNewEnum[value.name] = true;
    }
    for (const value of oldType.getValues()) {
      if (!valuesInNewEnum[value.name]) {
        valuesRemovedFromEnums.push({
          loc: getLocation(newType.astNode),
          resourceName: `${typeName}.${value.name}`,
          type: 'VALUE_REMOVED_FROM_ENUM',
          message: `Value \`${value.name}\` removed from enum \`${typeName}\``,
          wasDeprecated: isDeprecated(value.astNode),
        });
      }
    }
  }
  return valuesRemovedFromEnums;
}

/**
 * Detect dangerous and breaking changes from one version of a GraphQL schema to another
 */
export function detectBreakingChanges(
  from: string,
  to: string,
): { breakingChanges: BreakingChange[]; dangerousChanges: DangerousChange[] } {
  const fromSchema = buildSchema(from);
  const toSchema = buildSchema(to);

  const argChanges = findArgChanges(fromSchema, toSchema);

  const breakingChanges = [
    ...findRemovedTypes(fromSchema, toSchema),
    ...findTypesThatChangedKind(fromSchema, toSchema),
    ...findFieldsThatChangedTypeOnObjectOrInterfaceTypes(fromSchema, toSchema),
    ...argChanges.breakingChanges,
    ...findValuesRemovedFromEnums(fromSchema, toSchema),
  ];

  const dangerousChanges = [...argChanges.dangerousChanges];

  return {
    breakingChanges,
    dangerousChanges,
  };
}
