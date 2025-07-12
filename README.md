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
    steps:
      - uses: actions/checkout@v4
      - uses: felamaslen/detect-breaking-graphql-changes
        with:
          base_ref: ${{ github.event.pull_request.base.ref }}
          schema: schema.graphql
```

This will detect any dangerous and breaking changes on the version of `schema.graphql` between `base_ref` and `HEAD`.

## Development

To get set up, clone the repo, and then run:

1. `asdf install`
2. `corepack enable`
3. `asdf reshim`
4. `yarn`
