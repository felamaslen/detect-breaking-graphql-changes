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
