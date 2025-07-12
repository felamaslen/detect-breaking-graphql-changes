import { buildSchema } from 'graphql';

import { detectBreakingChanges } from './graphql-inspector';

describe('field removal', () => {
  it('should detect when a field is removed from an object type', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        name: String
        email: String
      }
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
        name: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe('`User.email` removed from schema');
    expect(changes[0].type).toBe('FIELD_REMOVED');
    expect(changes[0].resourceName).toBe('User.email');
  });

  it('should detect multiple field removals from the same type', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        name: String
        email: String
        age: Int
      }
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(3);
    expect(changes.map(c => c.message)).toEqual(
      expect.arrayContaining([
        '`User.name` removed from schema',
        '`User.email` removed from schema',
        '`User.age` removed from schema',
      ]),
    );
    expect(changes.every(c => c.type === 'FIELD_REMOVED')).toBe(true);
  });

  it('should detect field removals from multiple types', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        name: String
      }

      type Post {
        id: String
        title: String
        content: String
      }
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
      }

      type Post {
        id: String
        title: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(2);
    expect(changes.map(c => c.message)).toEqual(
      expect.arrayContaining([
        '`User.name` removed from schema',
        '`Post.content` removed from schema',
      ]),
    );
    expect(changes.every(c => c.type === 'FIELD_REMOVED')).toBe(true);
  });

  it('should not detect breaking changes when no fields are removed', () => {
    const schema = buildSchema(`
      type User {
        id: String
        name: String
      }
    `);

    const changes = detectBreakingChanges(schema, schema);

    expect(changes).toHaveLength(0);
  });

  it('should not detect breaking changes when fields are added', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        name: String
      }
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
        name: String
        email: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(0);
  });
});

describe('type removal', () => {
  it('should detect when a type is completely removed', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        name: String
      }
      
      type Post {
        id: String
        title: String
      }
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
        name: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe('`Post` removed from schema');
    expect(changes[0].type).toBe('TYPE_REMOVED');
    expect(changes[0].resourceName).toBe('Post');
  });

  it('should detect multiple type removals', () => {
    const fromSchema = buildSchema(`
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
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
        name: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(2);
    expect(changes.map(c => c.message)).toEqual(
      expect.arrayContaining([
        '`Post` removed from schema',
        '`Comment` removed from schema',
      ]),
    );
    expect(changes.every(c => c.type === 'TYPE_REMOVED')).toBe(true);
  });

  it('should not detect built-in scalar type removals', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        age: Int
        score: Float
        active: Boolean
      }
    `);

    const toSchema = buildSchema(`
      type User {
        id: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    // Should only detect field removals, not scalar type removals
    expect(changes.every(c => c.type === 'FIELD_REMOVED')).toBe(true);
    expect(changes.some(c => c.type === 'TYPE_REMOVED')).toBe(false);
  });
});

describe('type kind changes', () => {
  it('should detect when a type changes from object to scalar', () => {
    const fromSchema = buildSchema(`
      type User {
        id: String
        name: String
      }
    `);

    const toSchema = buildSchema(`
      scalar User
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      '`User` changed from an Object type to a Scalar type',
    );
    expect(changes[0].type).toBe('TYPE_CHANGED_KIND');
    expect(changes[0].resourceName).toBe('User');
  });

  it('should detect when a type changes from enum to object', () => {
    const fromSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `);

    const toSchema = buildSchema(`
      type Status {
        value: String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      '`Status` changed from an Enum type to an Object type',
    );
    expect(changes[0].type).toBe('TYPE_CHANGED_KIND');
    expect(changes[0].resourceName).toBe('Status');
  });
});

describe('argument changes', () => {
  it('should detect when an argument is removed', () => {
    const fromSchema = buildSchema(`
      type Query {
        user(id: String, name: String): String
      }
    `);

    const toSchema = buildSchema(`
      type Query {
        user(id: String): String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      '`Query.user` arg `name` removed from schema',
    );
    expect(changes[0].type).toBe('ARG_REMOVED');
    expect(changes[0].resourceName).toBe('user.name');
  });

  it('should detect when a required argument is added', () => {
    const fromSchema = buildSchema(`
      type Query {
        user(id: String): String
      }
    `);

    const toSchema = buildSchema(`
      type Query {
        user(id: String, name: String!): String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      'A required arg `name` on `Query.user` was added',
    );
    expect(changes[0].type).toBe('REQUIRED_ARG_ADDED');
    expect(changes[0].resourceName).toBe('Query.user');
  });

  it('should detect when an argument type changes in an incompatible way', () => {
    const fromSchema = buildSchema(`
      type Query {
        user(id: String): String
      }
    `);

    const toSchema = buildSchema(`
      type Query {
        user(id: Int): String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      '`Query.user` arg `id` changed type from `String` to `Int`',
    );
    expect(changes[0].type).toBe('ARG_CHANGED_KIND');
    expect(changes[0].resourceName).toBe('user.id');
  });

  it('should detect when an argument becomes required', () => {
    const fromSchema = buildSchema(`
      type Query {
        user(id: String): String
      }
    `);

    const toSchema = buildSchema(`
      type Query {
        user(id: String!): String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      '`Query.user` arg `id` changed type from `String` to `String!`',
    );
    expect(changes[0].type).toBe('ARG_BECAME_REQUIRED');
    expect(changes[0].resourceName).toBe('user.id');
  });

  it('should not detect breaking changes when optional arguments are added', () => {
    const fromSchema = buildSchema(`
      type Query {
        user(id: String): String
      }
    `);

    const toSchema = buildSchema(`
      type Query {
        user(id: String, name: String): String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(0);
  });

  it('should not detect breaking changes when arguments become optional', () => {
    const fromSchema = buildSchema(`
      type Query {
        user(id: String!): String
      }
    `);

    const toSchema = buildSchema(`
      type Query {
        user(id: String): String
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(0);
  });
});

describe('enum value changes', () => {
  it('should detect when an enum value is removed', () => {
    const fromSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
        PENDING
      }
    `);

    const toSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(1);
    expect(changes[0].message).toBe(
      'Value `PENDING` removed from enum `Status`',
    );
    expect(changes[0].type).toBe('VALUE_REMOVED_FROM_ENUM');
    expect(changes[0].resourceName).toBe('Status.PENDING');
  });

  it('should detect multiple enum value removals', () => {
    const fromSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
        PENDING
        ARCHIVED
      }
    `);

    const toSchema = buildSchema(`
      enum Status {
        ACTIVE
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(3);
    expect(changes.map(c => c.message)).toEqual(
      expect.arrayContaining([
        'Value `INACTIVE` removed from enum `Status`',
        'Value `PENDING` removed from enum `Status`',
        'Value `ARCHIVED` removed from enum `Status`',
      ]),
    );
    expect(changes.every(c => c.type === 'VALUE_REMOVED_FROM_ENUM')).toBe(true);
  });

  it('should detect enum value removals from multiple enums', () => {
    const fromSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
      }
      
      enum Priority {
        HIGH
        LOW
      }
    `);

    const toSchema = buildSchema(`
      enum Status {
        ACTIVE
      }
      
      enum Priority {
        HIGH
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(2);
    expect(changes.map(c => c.message)).toEqual(
      expect.arrayContaining([
        'Value `INACTIVE` removed from enum `Status`',
        'Value `LOW` removed from enum `Priority`',
      ]),
    );
    expect(changes.every(c => c.type === 'VALUE_REMOVED_FROM_ENUM')).toBe(true);
  });

  it('should not detect breaking changes when enum values are added', () => {
    const fromSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `);

    const toSchema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
        PENDING
      }
    `);

    const changes = detectBreakingChanges(fromSchema, toSchema);

    expect(changes).toHaveLength(0);
  });

  it('should not detect breaking changes when no enum values change', () => {
    const schema = buildSchema(`
      enum Status {
        ACTIVE
        INACTIVE
      }
    `);

    const changes = detectBreakingChanges(schema, schema);

    expect(changes).toHaveLength(0);
  });
});
