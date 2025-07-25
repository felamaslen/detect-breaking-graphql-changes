import gql from 'fake-tag';

import { detectBreakingChanges } from './detectBreakingChanges';

describe('field removal', () => {
  it('should detect when a field is removed from an object type', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
        email: String
      }
    `;

    const toSchema = gql`
      type User {
        id: String
        name: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe('`User.email` removed from schema');
    expect(breakingChanges[0].type).toBe('FIELD_REMOVED');
    expect(breakingChanges[0].resourceName).toBe('User.email');
    expect(breakingChanges[0].loc).toBe('2:7');
  });

  it('should detect multiple field removals from the same type', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
        email: String
        age: Int
      }
    `;

    const toSchema = gql`
      type User {
        id: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(3);
    expect(breakingChanges).toStrictEqual(
      expect.arrayContaining([
        {
          type: 'FIELD_REMOVED',
          message: '`User.name` removed from schema',
          resourceName: 'User.name',
          loc: '2:7',
          wasDeprecated: false,
        },
        {
          type: 'FIELD_REMOVED',
          message: '`User.email` removed from schema',
          resourceName: 'User.email',
          loc: '2:7',
          wasDeprecated: false,
        },
        {
          type: 'FIELD_REMOVED',
          message: '`User.age` removed from schema',
          resourceName: 'User.age',
          loc: '2:7',
          wasDeprecated: false,
        },
      ]),
    );
  });

  it('should detect field removals from multiple types', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
      }

      type Post {
        id: String
        title: String
        content: String
      }
    `;

    const toSchema = gql`
      type User {
        id: String
      }

      type Post {
        id: String
        title: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(2);
    expect(breakingChanges).toStrictEqual(
      expect.arrayContaining([
        {
          type: 'FIELD_REMOVED',
          message: '`User.name` removed from schema',
          resourceName: 'User.name',
          loc: '2:7',
          wasDeprecated: false,
        },
        {
          type: 'FIELD_REMOVED',
          message: '`Post.content` removed from schema',
          resourceName: 'Post.content',
          loc: '6:7',
          wasDeprecated: false,
        },
      ]),
    );
  });

  it('should not detect breaking changes when no fields are removed', () => {
    const schema = gql`
      type User {
        id: String
        name: String
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      schema,
      schema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(0);
  });

  it('should not detect breaking changes when fields are added', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
      }
    `;

    const toSchema = gql`
      type User {
        id: String
        name: String
        email: String
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(0);
  });
});

describe('type removal', () => {
  it('should detect when a type is completely removed', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
      }
      
      type Post {
        id: String
        title: String
      }
    `;

    const toSchema = gql`
      type User {
        id: String
        name: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe('`Post` removed from schema');
    expect(breakingChanges[0].type).toBe('TYPE_REMOVED');
    expect(breakingChanges[0].resourceName).toBe('Post');
    expect(breakingChanges[0].loc).toBeUndefined();
  });

  it('should detect multiple type removals', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
      }
      
      type Post {
        id: String
        title: String
      }
      
      type Comment {
        id: String
        text: String
      }
    `;

    const toSchema = gql`
      type User {
        id: String
        name: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(2);
    expect(breakingChanges).toStrictEqual(
      expect.arrayContaining([
        {
          type: 'TYPE_REMOVED',
          message: '`Post` removed from schema',
          resourceName: 'Post',
          loc: undefined,
          wasDeprecated: false,
        },
        {
          type: 'TYPE_REMOVED',
          message: '`Comment` removed from schema',
          resourceName: 'Comment',
          loc: undefined,
          wasDeprecated: false,
        },
      ]),
    );
  });

  it('should not detect built-in scalar type removals', () => {
    const fromSchema = gql`
      type User {
        id: String
        age: Int
        score: Float
        active: Boolean
      }
    `;

    const toSchema = gql`
      type User {
        id: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    // Should only detect field removals, not scalar type removals
    expect(breakingChanges.every((c) => c.type === 'FIELD_REMOVED')).toBe(true);
    expect(breakingChanges.some((c) => c.type === 'TYPE_REMOVED')).toBe(false);
  });
});

describe('type kind changes', () => {
  it('should detect when a type changes from object to scalar', () => {
    const fromSchema = gql`
      type User {
        id: String
        name: String
      }
    `;

    const toSchema = gql`
      scalar User
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      '`User` changed from an Object type to a Scalar type',
    );
    expect(breakingChanges[0].type).toBe('TYPE_CHANGED_KIND');
    expect(breakingChanges[0].resourceName).toBe('User');
    expect(breakingChanges[0].loc).toBe('2:14');
  });

  it('should detect when a type changes from enum to object', () => {
    const fromSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `;

    const toSchema = gql`
      type Status {
        value: String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      '`Status` changed from an Enum type to an Object type',
    );
    expect(breakingChanges[0].type).toBe('TYPE_CHANGED_KIND');
    expect(breakingChanges[0].resourceName).toBe('Status');
    expect(breakingChanges[0].loc).toBe('2:7');
  });
});

describe('argument changes', () => {
  it('should detect when an argument is removed', () => {
    const fromSchema = gql`
      type Query {
        user(id: String, name: String): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      '`Query.user` arg `name` removed from schema',
    );
    expect(breakingChanges[0].type).toBe('ARG_REMOVED');
    expect(breakingChanges[0].resourceName).toBe('user.name');
    expect(breakingChanges[0].loc).toBe('3:27');
  });

  it('should detect when a required argument is added', () => {
    const fromSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String, name: String!): String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      'A required arg `name` on `Query.user` was added',
    );
    expect(breakingChanges[0].type).toBe('REQUIRED_ARG_ADDED');
    expect(breakingChanges[0].resourceName).toBe('Query.user');
    expect(breakingChanges[0].loc).toBe('3:38');
  });

  it('should detect when an argument type changes in an incompatible way', () => {
    const fromSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: Int): String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      '`Query.user` arg `id` changed type from `String` to `Int`',
    );
    expect(breakingChanges[0].type).toBe('ARG_CHANGED_KIND');
    expect(breakingChanges[0].resourceName).toBe('user.id');
    expect(breakingChanges[0].loc).toBe('3:18');
  });

  it('should detect when an argument becomes required', () => {
    const fromSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String!): String
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      '`Query.user` arg `id` changed type from `String` to `String!`',
    );
    expect(breakingChanges[0].type).toBe('ARG_BECAME_REQUIRED');
    expect(breakingChanges[0].resourceName).toBe('user.id');
    expect(breakingChanges[0].loc).toBe('3:24');
  });

  it('should not detect breaking changes when optional arguments are added', () => {
    const fromSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String, name: String): String
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(1);
    expect(dangerousChanges[0].type).toBe('OPTIONAL_ARG_ADDED');
  });

  it('should not detect breaking changes when arguments become optional', () => {
    const fromSchema = gql`
      type Query {
        user(id: String!): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(0);
  });

  it('should not detect changes when field arg has array of custom object type with default value', () => {
    const schema = gql`
      enum SortField {
        CREATED_AT
        ID
      }

      input MySort {
        DESC: SortField
      }

      type Query {
        users(sort: [MySort!]! = [{ DESC: CREATED_AT }]): [String]
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      schema,
      schema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(0);
  });
});

describe('enum value changes', () => {
  it('should detect when an enum value is removed', () => {
    const fromSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
        PENDING
      }
    `;

    const toSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(1);
    expect(breakingChanges[0].message).toBe(
      'Value `PENDING` removed from enum `Status`',
    );
    expect(breakingChanges[0].type).toBe('VALUE_REMOVED_FROM_ENUM');
    expect(breakingChanges[0].resourceName).toBe('Status.PENDING');
    expect(breakingChanges[0].loc).toBe('2:7');
  });

  it('should detect multiple enum value removals', () => {
    const fromSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
        PENDING
        ARCHIVED
      }
    `;

    const toSchema = gql`
      enum Status {
        ACTIVE
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(3);
    expect(breakingChanges).toStrictEqual(
      expect.arrayContaining([
        {
          type: 'VALUE_REMOVED_FROM_ENUM',
          message: 'Value `INACTIVE` removed from enum `Status`',
          resourceName: 'Status.INACTIVE',
          loc: '2:7',
          wasDeprecated: false,
        },
        {
          type: 'VALUE_REMOVED_FROM_ENUM',
          message: 'Value `PENDING` removed from enum `Status`',
          resourceName: 'Status.PENDING',
          loc: '2:7',
          wasDeprecated: false,
        },
        {
          type: 'VALUE_REMOVED_FROM_ENUM',
          message: 'Value `ARCHIVED` removed from enum `Status`',
          resourceName: 'Status.ARCHIVED',
          loc: '2:7',
          wasDeprecated: false,
        },
      ]),
    );
  });

  it('should detect enum value removals from multiple enums', () => {
    const fromSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
      }
      
      enum Priority {
        HIGH
        LOW
      }
    `;

    const toSchema = gql`
      enum Status {
        ACTIVE
      }
      
      enum Priority {
        HIGH
      }
    `;

    const { breakingChanges } = detectBreakingChanges(fromSchema, toSchema);

    expect(breakingChanges).toHaveLength(2);
    expect(breakingChanges).toStrictEqual(
      expect.arrayContaining([
        {
          type: 'VALUE_REMOVED_FROM_ENUM',
          message: 'Value `INACTIVE` removed from enum `Status`',
          resourceName: 'Status.INACTIVE',
          loc: '2:7',
          wasDeprecated: false,
        },
        {
          type: 'VALUE_REMOVED_FROM_ENUM',
          message: 'Value `LOW` removed from enum `Priority`',
          resourceName: 'Priority.LOW',
          loc: '6:7',
          wasDeprecated: false,
        },
      ]),
    );
  });

  it('should not detect breaking changes when enum values are added', () => {
    const fromSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `;

    const toSchema = gql`
      enum Status {
        ACTIVE
        INACTIVE
        PENDING
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(0);
  });

  it('should not detect breaking changes when no enum values change', () => {
    const schema = gql`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      schema,
      schema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(0);
  });
});

describe('dangerous changes', () => {
  it('should detect when an optional argument is added', () => {
    const fromSchema = gql`
      type Query {
        user(id: String): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String, name: String): String
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(1);
    expect(dangerousChanges[0].message).toBe(
      'An optional arg `name` on `Query.user` was added',
    );
    expect(dangerousChanges[0].type).toBe('OPTIONAL_ARG_ADDED');
    expect(dangerousChanges[0].resourceName).toBe('Query.user');
    expect(dangerousChanges[0].loc).toBe('3:32');
  });

  it('should detect when an argument default value changes', () => {
    const fromSchema = gql`
      type Query {
        user(id: String = "default"): String
      }
    `;

    const toSchema = gql`
      type Query {
        user(id: String = "new_default"): String
      }
    `;

    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    expect(breakingChanges).toHaveLength(0);
    expect(dangerousChanges).toHaveLength(1);
    expect(dangerousChanges[0].message).toBe(
      '`Query.user` arg `id` has changed defaultValue',
    );
    expect(dangerousChanges[0].type).toBe('ARG_DEFAULT_VALUE_CHANGE');
    expect(dangerousChanges[0].resourceName).toBe('user.id');
    expect(dangerousChanges[0].loc).toBe('3:27');
  });
});
