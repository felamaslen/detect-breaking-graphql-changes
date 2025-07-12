import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { detectBreakingChanges } from './detectBreakingChanges';

export async function run(): Promise<void> {
  try {
    // Get inputs
    const baseRef = core.getInput('base_ref', { required: true });
    const schemaPath = core.getInput('schema', { required: true });

    core.info(`Comparing schema changes from ${baseRef} to HEAD`);
    core.info(`Schema file: ${schemaPath}`);

    // Get the GitHub token and create octokit client
    const token = core.getInput('token') || process.env.GITHUB_TOKEN || '';
    const octokit = github.getOctokit(token);

    // Get current schema
    const currentSchemaContent = readFileSync(
      join(process.cwd(), schemaPath),
      'utf8',
    );

    // Get base schema from git
    const { data: baseFile } = await octokit.rest.repos.getContent({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      path: schemaPath,
      ref: baseRef,
    });

    if (!('content' in baseFile)) {
      throw new Error('Could not retrieve base schema file');
    }

    const baseSchemaContent = Buffer.from(baseFile.content, 'base64').toString(
      'utf8',
    );

    // Compare schemas using our custom GraphQL inspector
    const { breakingChanges, dangerousChanges } = detectBreakingChanges(
      baseSchemaContent,
      currentSchemaContent,
    );

    // Set outputs
    core.setOutput('breaking_changes', JSON.stringify(breakingChanges));
    core.setOutput('dangerous_changes', JSON.stringify(dangerousChanges));

    // Log results
    core.info(`Found ${breakingChanges.length} breaking changes`);
    core.info(`Found ${dangerousChanges.length} dangerous changes`);

    if (breakingChanges.length > 0) {
      breakingChanges.forEach((change) => {
        const [line, col] = change.loc.split(':').map(Number);
        core.error(`[Breaking change] ${change.message}`, {
          file: schemaPath,
          startLine: line || undefined,
          startColumn: col || undefined,
        });
      });
    }

    if (dangerousChanges.length > 0) {
      dangerousChanges.forEach((change) => {
        const [line, col] = change.loc.split(':').map(Number);
        core.warning(`[Dangerous change] ${change.message}`, {
          file: schemaPath,
          startLine: line || undefined,
          startColumn: col || undefined,
        });
      });
    }

    // Fail the action if breaking changes are found
    if (breakingChanges.length > 0) {
      core.setFailed(
        `Found ${breakingChanges.length} breaking changes in GraphQL schema`,
      );
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

// Only run when this file is executed directly (not imported)
if (require.main === module) {
  run();
}
