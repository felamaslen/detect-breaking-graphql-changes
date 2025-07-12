import { readFileSync } from 'node:fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all the dependencies
vi.mock('@actions/core');
vi.mock('@actions/github');
vi.mock('node:fs');

// Import the module after mocking
const mockCore = vi.mocked(core);
const mockGithub = vi.mocked(github);
const mockReadFileSync = vi.mocked(readFileSync);

// Import the run function
import { run } from './index';

describe('GitHub Action', () => {
  let mockGetContent: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock core methods
    mockCore.getInput = vi.fn();
    mockCore.info = vi.fn();
    mockCore.warning = vi.fn();
    mockCore.error = vi.fn();
    mockCore.setOutput = vi.fn();
    mockCore.setFailed = vi.fn();

    // Mock github context
    mockGithub.context = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
    } as any;

    // Mock github getOctokit
    mockGetContent = vi.fn();
    const mockOctokit = {
      rest: {
        repos: {
          getContent: mockGetContent,
        },
      },
    };
    mockGithub.getOctokit = vi.fn().mockReturnValue(mockOctokit);

    // Default input mocks
    mockCore.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'base_ref':
          return 'main';
        case 'schema':
          return 'schema.graphql';
        case 'token':
          return 'test-token';
        default:
          return '';
      }
    });

    // Set up process.env
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runAction = async () => {
    await run();
  };

  it('should pass with no annotations when schema change is not breaking', async () => {
    // Setup: schema with added field (non-breaking)
    const baseSchema = `
      type User {
        id: String
        name: String
      }
    `;

    const currentSchema = `
      type User {
        id: String
        name: String
        email: String
      }
    `;

    mockReadFileSync.mockReturnValue(currentSchema);
    mockGetContent.mockResolvedValue({
      data: {
        content: Buffer.from(baseSchema).toString('base64'),
        encoding: 'base64',
      },
    } as any);

    await runAction();

    // Verify GitHub API call
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'schema.graphql',
      ref: 'main',
    });

    // Assertions
    expect(mockCore.info).toHaveBeenCalledWith('Found 0 breaking changes');
    expect(mockCore.info).toHaveBeenCalledWith('Found 0 dangerous changes');
    expect(mockCore.warning).not.toHaveBeenCalled();
    expect(mockCore.error).not.toHaveBeenCalled();
    expect(mockCore.setFailed).not.toHaveBeenCalled();
    expect(mockCore.setOutput).toHaveBeenCalledWith('breaking_changes', '[]');
    expect(mockCore.setOutput).toHaveBeenCalledWith('dangerous_changes', '[]');
  });

  it('should pass with warning annotations when schema change is dangerous but not breaking', async () => {
    // Setup: schema with optional argument added (dangerous but not breaking)
    const baseSchema = `
      type Query {
        user(id: String): String
      }
    `;

    const currentSchema = `
      type Query {
        user(id: String, name: String): String
      }
    `;

    mockReadFileSync.mockReturnValue(currentSchema);
    mockGetContent.mockResolvedValue({
      data: {
        content: Buffer.from(baseSchema).toString('base64'),
        encoding: 'base64',
      },
    } as any);

    await runAction();

    // Verify GitHub API call
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'schema.graphql',
      ref: 'main',
    });

    // Assertions
    expect(mockCore.info).toHaveBeenCalledWith('Found 0 breaking changes');
    expect(mockCore.info).toHaveBeenCalledWith('Found 1 dangerous change');
    expect(mockCore.warning).toHaveBeenCalledWith(
      '[Dangerous change] An optional arg `name` on `Query.user` was added',
      {
        file: 'schema.graphql',
        startLine: 3,
        startColumn: 32,
      },
    );
    expect(mockCore.error).not.toHaveBeenCalled();
    expect(mockCore.setFailed).not.toHaveBeenCalled();
    expect(mockCore.setOutput).toHaveBeenCalledWith('breaking_changes', '[]');
    expect(mockCore.setOutput).toHaveBeenCalledWith(
      'dangerous_changes',
      expect.stringContaining('OPTIONAL_ARG_ADDED'),
    );
  });

  it('should fail with error annotations when schema change is breaking', async () => {
    // Setup: schema with removed field (breaking)
    const baseSchema = `
      type User {
        id: String
        name: String
        email: String
      }
    `;

    const currentSchema = `
      type User {
        id: String
        name: String
      }
    `;

    mockReadFileSync.mockReturnValue(currentSchema);
    mockGetContent.mockResolvedValue({
      data: {
        content: Buffer.from(baseSchema).toString('base64'),
        encoding: 'base64',
      },
    } as any);

    await runAction();

    // Verify GitHub API call
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'schema.graphql',
      ref: 'main',
    });

    // Assertions
    expect(mockCore.error).toHaveBeenCalledWith(
      '[Breaking change] `User.email` removed from schema',
      {
        file: 'schema.graphql',
        startLine: 5,
        startColumn: 16,
      },
    );
    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'Found 1 breaking change in GraphQL schema',
    );
    expect(mockCore.setOutput).toHaveBeenCalledWith(
      'breaking_changes',
      expect.stringContaining('FIELD_REMOVED'),
    );
    expect(mockCore.setOutput).toHaveBeenCalledWith('dangerous_changes', '[]');
  });

  it('should handle errors gracefully', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    await runAction();

    // Verify GitHub API was not called due to earlier error
    expect(mockGetContent).not.toHaveBeenCalled();
    expect(mockCore.setFailed).toHaveBeenCalledWith('File not found');
  });

  it('should handle missing base file content', async () => {
    mockReadFileSync.mockReturnValue('type User { id: String }');
    mockGetContent.mockResolvedValue({
      data: {
        // Missing content property
        encoding: 'base64',
      },
    } as any);

    await runAction();

    // Verify GitHub API was called with correct arguments
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'schema.graphql',
      ref: 'main',
    });
    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'Could not retrieve base schema file',
    );
  });

  it('should handle custom input parameters correctly', async () => {
    // Override input mocks for custom values
    mockCore.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'base_ref':
          return 'develop';
        case 'schema':
          return 'custom/schema.graphql';
        case 'token':
          return 'custom-token';
        default:
          return '';
      }
    });

    const baseSchema = 'type User { id: String }';
    const currentSchema = 'type User { id: String }';

    mockReadFileSync.mockReturnValue(currentSchema);
    mockGetContent.mockResolvedValue({
      data: {
        content: Buffer.from(baseSchema).toString('base64'),
        encoding: 'base64',
      },
    } as any);

    await runAction();

    // Verify GitHub API was called with custom parameters
    expect(mockGetContent).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      path: 'custom/schema.graphql',
      ref: 'develop',
    });

    // Verify core.getOctokit was called with custom token
    expect(mockGithub.getOctokit).toHaveBeenCalledWith('custom-token');
  });
});
