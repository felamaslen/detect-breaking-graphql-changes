import { readFileSync } from 'node:fs';
import { detectBreakingChanges } from './detectBreakingChanges';

// ANSI color codes
const colors = {
  red: '\x1b[31m',
  orange: '\x1b[33m',
  green: '\x1b[32m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function printUsage() {
  console.log(`
Usage: detect-breaking-graphql-changes <from-schema> <to-schema>

Arguments:
  from-schema    Path to the original GraphQL schema file
  to-schema      Path to the new GraphQL schema file

Example:
  detect-breaking-graphql-changes schema-old.graphql schema-new.graphql
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error(
      `${colors.red}Error: Expected 2 arguments, got ${args.length}${colors.reset}`,
    );
    printUsage();
    process.exit(1);
  }

  const [fromSchemaPath, toSchemaPath] = args;

  let fromSchema: string;
  let toSchema: string;

  try {
    fromSchema = readFileSync(fromSchemaPath, 'utf8');
  } catch (error) {
    console.error(
      `${colors.red}Error reading from schema file: ${fromSchemaPath}${colors.reset}`,
    );
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  try {
    toSchema = readFileSync(toSchemaPath, 'utf8');
  } catch (error) {
    console.error(
      `${colors.red}Error reading to schema file: ${toSchemaPath}${colors.reset}`,
    );
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  try {
    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      fromSchema,
      toSchema,
    );

    console.log(
      `${colors.bold}GraphQL Schema Change Detection${colors.reset}\n`,
    );
    console.log(`Comparing: ${fromSchemaPath} → ${toSchemaPath}\n`);

    if (breakingChanges.length === 0 && dangerousChanges.length === 0) {
      console.log(
        `${colors.green}✓ No breaking or dangerous changes detected!${colors.reset}`,
      );
      process.exit(0);
    }

    if (breakingChanges.length > 0) {
      console.log(
        `${colors.red}${colors.bold}Breaking Changes (${breakingChanges.length}):${colors.reset}`,
      );
      breakingChanges.forEach((change, index) => {
        console.log(
          `${colors.red}  ${index + 1}. ${change.message}${colors.reset}`,
        );
        console.log(`     Resource: ${change.resourceName}`);
        console.log(`     Type: ${change.type}`);
        console.log(`     Location: ${change.loc}`);
        if (change.wasDeprecated) {
          console.log('     Note: Resource was deprecated');
        }
        console.log();
      });
    }

    if (dangerousChanges.length > 0) {
      console.log(
        `${colors.orange}${colors.bold}Dangerous Changes (${dangerousChanges.length}):${colors.reset}`,
      );
      dangerousChanges.forEach((change, index) => {
        console.log(
          `${colors.orange}  ${index + 1}. ${change.message}${colors.reset}`,
        );
        console.log(`     Resource: ${change.resourceName}`);
        console.log(`     Type: ${change.type}`);
        console.log(`     Location: ${change.loc}`);
        if (change.wasDeprecated) {
          console.log('     Note: Resource was deprecated');
        }
        console.log();
      });
    }

    // Exit with error code if there are breaking changes
    if (breakingChanges.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`${colors.red}Error analyzing schemas:${colors.reset}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
