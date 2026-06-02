/**
 * @fileoverview Tests for the interactive mode orchestrator
 * @description Tests for PromptFlow types, runFlow(), and startInteractiveMode()
 */

// Mock inquirer before any imports that might use it
jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  Separator: class Separator {},
}));

jest.mock('ora', () => () => ({
  start: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  text: '',
}));

jest.mock('chalk', () => {
  const identity = (s: string) => s;
  const proxy = new Proxy(identity, {
    get: () => proxy,
  });
  return { default: proxy, __esModule: true };
});

import inquirer from 'inquirer';
import type { PromptFlow, PromptStep, Answers } from '../../src/commands/interactive/interactive';
import { runFlow } from '../../src/commands/interactive/interactive';

const mockPrompt = inquirer.prompt as jest.MockedFunction<typeof inquirer.prompt>;

// ─── runFlow ──────────────────────────────────────────────────────────────────

describe('runFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collects answers for each step and calls execute', async () => {
    mockPrompt
      .mockResolvedValueOnce({ projectName: 'my-app' })
      .mockResolvedValueOnce({ network: 'testnet' });

    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Test Flow',
      steps: [
        { id: 'projectName', title: 'Project name:', type: 'input' },
        {
          id: 'network',
          title: 'Network:',
          type: 'select',
          choices: [{ name: 'Testnet', value: 'testnet', default: true }],
        },
      ],
      execute,
    };

    await runFlow(flow);

    expect(execute).toHaveBeenCalledWith({
      projectName: 'my-app',
      network: 'testnet',
    });
  });

  it('skips steps whose when() condition is false', async () => {
    mockPrompt
      .mockResolvedValueOnce({ choice: 'create' })
      .mockResolvedValueOnce({ name: 'myWallet' });

    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Conditional Flow',
      steps: [
        {
          id: 'choice',
          title: 'Action:',
          type: 'select',
          choices: [
            { name: 'Create', value: 'create', default: true },
            { name: 'Import', value: 'import' },
          ],
        },
        {
          id: 'secretKey',
          title: 'Secret key:',
          type: 'password',
          when: (answers) => answers.choice === 'import',
        },
        { id: 'name', title: 'Wallet name:', type: 'input' },
      ],
      execute,
    };

    await runFlow(flow);

    // secretKey step should be skipped — inquirer called only twice
    expect(mockPrompt).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith({ choice: 'create', name: 'myWallet' });
  });

  it('skips optional steps left blank', async () => {
    mockPrompt
      .mockResolvedValueOnce({ required: 'hello' })
      .mockResolvedValueOnce({ optional: '' });

    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Optional Step Flow',
      steps: [
        { id: 'required', title: 'Required:', type: 'input' },
        { id: 'optional', title: 'Optional:', type: 'input', optional: true, default: '' },
      ],
      execute,
    };

    await runFlow(flow);

    // optional answer is '' → undefined → not included in answers
    expect(execute).toHaveBeenCalledWith({ required: 'hello' });
  });

  it('supports dynamic title via function', async () => {
    mockPrompt
      .mockResolvedValueOnce({ amount: '100' })
      .mockResolvedValueOnce({ confirm: true });

    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Dynamic Title Flow',
      steps: [
        { id: 'amount', title: 'Amount:', type: 'input' },
        {
          id: 'confirm',
          title: (answers) => `Confirm sending ${answers.amount}?`,
          type: 'confirm',
        },
      ],
      execute,
    };

    await runFlow(flow);

    expect(execute).toHaveBeenCalledWith({ amount: '100', confirm: true });
  });

  it('handles execute() rejection without throwing', async () => {
    mockPrompt.mockResolvedValueOnce({ name: 'test' });

    const flow: PromptFlow = {
      name: 'Failing Flow',
      steps: [{ id: 'name', title: 'Name:', type: 'input' }],
      execute: async () => {
        throw new Error('execute failed');
      },
    };

    await expect(runFlow(flow)).resolves.not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it('cancels gracefully when inquirer throws AbortError', async () => {
    mockPrompt.mockRejectedValueOnce(new Error('User force closed the prompt'));
    const execute = jest.fn();

    const flow: PromptFlow = {
      name: 'Aborted Flow',
      steps: [{ id: 'name', title: 'Name:', type: 'input' }],
      execute,
    };

    await expect(runFlow(flow)).resolves.not.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─── PromptStep input types ───────────────────────────────────────────────────

describe('runFlow — step types', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('handles password type', async () => {
    mockPrompt.mockResolvedValueOnce({ secret: 'SXXXXXX' });
    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Password Flow',
      steps: [{ id: 'secret', title: 'Secret:', type: 'password' }],
      execute,
    };

    await runFlow(flow);
    expect(execute).toHaveBeenCalledWith({ secret: 'SXXXXXX' });
  });

  it('handles multiselect type', async () => {
    mockPrompt.mockResolvedValueOnce({ features: ['wallet', 'oracle'] });
    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Multiselect Flow',
      steps: [
        {
          id: 'features',
          title: 'Features:',
          type: 'multiselect',
          choices: [
            { name: 'Wallet', value: 'wallet', default: true },
            { name: 'Oracle', value: 'oracle' },
          ],
        },
      ],
      execute,
    };

    await runFlow(flow);
    expect(execute).toHaveBeenCalledWith({ features: ['wallet', 'oracle'] });
  });

  it('handles confirm type', async () => {
    mockPrompt.mockResolvedValueOnce({ ok: false });
    const execute = jest.fn().mockResolvedValue(undefined);

    const flow: PromptFlow = {
      name: 'Confirm Flow',
      steps: [{ id: 'ok', title: 'Proceed?', type: 'confirm', default: true }],
      execute,
    };

    await runFlow(flow);
    expect(execute).toHaveBeenCalledWith({ ok: false });
  });
});
