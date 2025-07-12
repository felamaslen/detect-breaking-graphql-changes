# detect-breaking-graphql-changes

This is a Github Action to detect breaking changes on a GraphQL schema.

## Usage

Example: `.github/workflows/graphql.yml`:

```
name: GraphQL breaking changes
on:
  pull_request:
    paths:
      - .github/workflows/graphql.yml
      - schema.graphql
jobs:
  detect-breaking-changes:
    permissions:
      contents: read
    env:
      GITHUB_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
      - uses: felamaslen/detect-breaking-graphql-changes
        with:
          base_ref: ${{ github.event.pull_request.base.ref }}
          schema: schema.graphql
```

This will detect any dangerous and breaking changes on the version of `schema.graphql` between `base_ref` and `HEAD`.

## CLI Usage

This package also provides a command-line interface for comparing GraphQL schemas locally.

### Installation

Install the package globally:

```bash
npm install -g detect-breaking-graphql-changes
```

Or use it directly with npx:

```bash
npx detect-breaking-graphql-changes
```

### Usage

```bash
detect-breaking-graphql-changes <from-schema> <to-schema>
```

**Arguments:**
- `from-schema`: Path to the original GraphQL schema file
- `to-schema`: Path to the new GraphQL schema file

**Example:**

```bash
detect-breaking-graphql-changes schema-old.graphql schema-new.graphql
```

### Output

The CLI provides color-coded output:

- **🔴 Breaking Changes**: Changes that will break existing clients (shown in red)
- **🟠 Dangerous Changes**: Changes that might affect clients but won't break them (shown in orange)  
- **🟢 Success**: No breaking or dangerous changes detected (shown in green)

Each change includes:
- Description of the change
- Resource name affected
- Change type
- Location in the schema file
- Deprecation status (if applicable)

**Exit Codes:**
- `0`: Success (no breaking changes)
- `1`: Breaking changes detected

### Example Output

```
GraphQL Schema Change Detection

Comparing: schema-old.graphql → schema-new.graphql

Breaking Changes (1):
  1. `User.email` removed from schema
     Resource: User.email
     Type: FIELD_REMOVED
     Location: 4:10

Dangerous Changes (1):
  1. An optional arg `name` on `Query.user` was added
     Resource: Query.user
     Type: OPTIONAL_ARG_ADDED
     Location: 7:27
```

## Development

To get set up, clone the repo, and then run:

1. `asdf install`
2. `corepack enable`
3. `asdf reshim`
4. `yarn`
