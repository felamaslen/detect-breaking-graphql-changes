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
    expect(changes[0].message).toBe(
      "Field 'email' was removed from object type 'User'.",
    );
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
        "Field 'name' was removed from object type 'User'.",
        "Field 'email' was removed from object type 'User'.",
        "Field 'age' was removed from object type 'User'.",
      ]),
    );
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
        "Field 'name' was removed from object type 'User'.",
        "Field 'content' was removed from object type 'Post'.",
      ]),
    );
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
