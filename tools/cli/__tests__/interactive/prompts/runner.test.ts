/**
 * Tests for the PromptFlow runner.
 *
 * The runner is the engine behind every guided prompt flow in the CLI.
 * It orchestrates: header → steps (with validation + conditional `when`) →
 * summary → optional confirm gate (destructive only) → executor.
 */

import {
  runPromptFlow,
  PromptFlow,
} from '../../../src/commands/interactive/prompts/index';

type Answer = Record<string, unknown>;

/**
 * Build a scripted prompt fn that returns answers in a specific order.
 * Each call answers exactly one inquirer question. The fn records every
 * question for assertion.
 */
function scriptedPrompt(answers: Answer[]) {
  const calls: Answer[] = [];
  let i = 0;
  const fn = jest.fn(async (questions: any) => {
    const list = Array.isArray(questions) ? questions : [questions];
    const result: Answer = {};
    for (const q of list) {
      calls.push(q);
      const next = answers[i++] ?? {};
      result[q.name] = next[q.name];
    }
    return result;
  });
  return { fn: fn as unknown as PromptFlow['steps'] extends never[] ? never : any, calls };
}

const baseFlow: PromptFlow = {
  id: 'test:basic',
  title: 'Test Flow',
  description: 'Just a test',
  steps: [
    {
      name: 'name',
      message: 'Name?',
      type: 'input',
      validate: (v) => (String(v ?? '').trim() ? true : 'Required'),
    },
    {
      name: 'network',
      message: 'Network?',
      type: 'list',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
      default: 'testnet',
    },
  ],
  buildArgs: (a) => ['wallet', 'create', '--name', String(a.name), `--${a.network}`],
};

describe('runPromptFlow', () => {
  it('collects answers in order and calls executor with buildArgs output', async () => {
    const { fn } = scriptedPrompt([{ name: 'alice' }, { network: 'mainnet' }]);
    const executor = jest.fn(async () => {});

    const result = await runPromptFlow(baseFlow, executor, {
      prompt: fn,
      silent: true,
    });

    expect(result.executed).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.argv).toEqual(['wallet', 'create', '--name', 'alice', '--mainnet']);
    expect(executor).toHaveBeenCalledWith(['wallet', 'create', '--name', 'alice', '--mainnet']);
  });

  it('records each step answer in result.answers', async () => {
    const { fn } = scriptedPrompt([{ name: 'bob' }, { network: 'testnet' }]);
    const executor = jest.fn(async () => {});

    const result = await runPromptFlow(baseFlow, executor, {
      prompt: fn,
      silent: true,
    });

    expect(result.answers).toEqual({ name: 'bob', network: 'testnet' });
  });

  it('skips steps whose `when` returns false', async () => {
    const flow: PromptFlow = {
      id: 'test:conditional',
      title: 'Conditional',
      description: '',
      steps: [
        { name: 'encrypt', message: 'Encrypt?', type: 'confirm', default: false },
        {
          name: 'password',
          message: 'Password?',
          type: 'password',
          when: (a) => a.encrypt === true,
        },
        { name: 'tail', message: 'Tail?', type: 'input' },
      ],
      buildArgs: (a) => ['x', String(a.encrypt), String(a.tail ?? '')],
    };

    const { fn, calls } = scriptedPrompt([{ encrypt: false }, { tail: 'done' }]);
    const executor = jest.fn(async () => {});

    const result = await runPromptFlow(flow, executor, { prompt: fn, silent: true });

    expect(result.executed).toBe(true);
    expect(result.answers).toEqual({ encrypt: false, tail: 'done' });
    // Password step never reached
    expect(calls.find((q: any) => q.name === 'password')).toBeUndefined();
    expect(executor).toHaveBeenCalledWith(['x', 'false', 'done']);
  });

  it('runs the conditional step when `when` returns true', async () => {
    const flow: PromptFlow = {
      id: 'test:conditional2',
      title: 'Conditional2',
      description: '',
      steps: [
        { name: 'encrypt', message: 'Encrypt?', type: 'confirm', default: true },
        {
          name: 'password',
          message: 'Password?',
          type: 'password',
          when: (a) => a.encrypt === true,
        },
      ],
      buildArgs: (a) => ['x', a.encrypt ? '1' : '0', String(a.password ?? '')],
    };

    const { fn, calls } = scriptedPrompt([{ encrypt: true }, { password: 'secret-123' }]);
    const executor = jest.fn(async () => {});

    await runPromptFlow(flow, executor, { prompt: fn, silent: true });

    expect(calls.find((q: any) => q.name === 'password')).toBeDefined();
    expect(executor).toHaveBeenCalledWith(['x', '1', 'secret-123']);
  });

  describe('confirmation gate for destructive flows', () => {
    const destructiveFlow: PromptFlow = {
      ...baseFlow,
      id: 'test:destructive',
      destructive: true,
    };

    it('asks for confirmation before executing destructive flow', async () => {
      const { fn, calls } = scriptedPrompt([
        { name: 'alice' },
        { network: 'mainnet' },
        { _confirm: true },
      ]);
      const executor = jest.fn(async () => {});

      const result = await runPromptFlow(destructiveFlow, executor, {
        prompt: fn,
        silent: true,
      });

      expect(result.executed).toBe(true);
      const confirmQ = calls.find((q: any) => q.name === '_confirm');
      expect(confirmQ).toBeDefined();
      expect((confirmQ as any).type).toBe('confirm');
    });

    it('aborts when user declines the confirmation', async () => {
      const { fn } = scriptedPrompt([
        { name: 'alice' },
        { network: 'mainnet' },
        { _confirm: false },
      ]);
      const executor = jest.fn(async () => {});

      const result = await runPromptFlow(destructiveFlow, executor, {
        prompt: fn,
        silent: true,
      });

      expect(result.cancelled).toBe(true);
      expect(result.executed).toBe(false);
      expect(executor).not.toHaveBeenCalled();
    });

    it('skips confirmation when `yes: true` is passed', async () => {
      const { fn, calls } = scriptedPrompt([{ name: 'alice' }, { network: 'mainnet' }]);
      const executor = jest.fn(async () => {});

      const result = await runPromptFlow(destructiveFlow, executor, {
        prompt: fn,
        yes: true,
        silent: true,
      });

      expect(result.executed).toBe(true);
      expect(calls.find((q: any) => q.name === '_confirm')).toBeUndefined();
      expect(executor).toHaveBeenCalled();
    });

    it('non-destructive flows skip the confirmation gate by default', async () => {
      const { fn, calls } = scriptedPrompt([{ name: 'alice' }, { network: 'testnet' }]);
      const executor = jest.fn(async () => {});

      await runPromptFlow(baseFlow, executor, { prompt: fn, silent: true });

      expect(calls.find((q: any) => q.name === '_confirm')).toBeUndefined();
      expect(executor).toHaveBeenCalled();
    });
  });

  describe('user cancellation (Ctrl+C / inquirer abort)', () => {
    it('returns cancelled when inquirer throws an abort error during steps', async () => {
      const abortFn = jest.fn(async () => {
        throw new Error('User force closed the prompt');
      });
      const executor = jest.fn(async () => {});

      const result = await runPromptFlow(baseFlow, abortFn as any, {
        prompt: abortFn as any,
        silent: true,
      });

      expect(result.cancelled).toBe(true);
      expect(result.executed).toBe(false);
      expect(executor).not.toHaveBeenCalled();
    });

    it('re-throws non-abort errors from inquirer', async () => {
      const boomFn = jest.fn(async () => {
        throw new Error('Disk full');
      });
      const executor = jest.fn(async () => {});

      await expect(
        runPromptFlow(baseFlow, executor, { prompt: boomFn as any, silent: true }),
      ).rejects.toThrow('Disk full');
    });
  });

  describe('executor errors', () => {
    it('captures executor errors into result.error without throwing', async () => {
      const { fn } = scriptedPrompt([{ name: 'alice' }, { network: 'testnet' }]);
      const executor = jest.fn(async () => {
        throw new Error('Network down');
      });

      const result = await runPromptFlow(baseFlow, executor, {
        prompt: fn,
        silent: true,
      });

      expect(result.executed).toBe(false);
      expect(result.cancelled).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Network down');
    });
  });

  describe('validation', () => {
    it('validators are attached to inquirer questions so inquirer enforces them', async () => {
      const { fn, calls } = scriptedPrompt([{ name: 'alice' }, { network: 'testnet' }]);
      const executor = jest.fn(async () => {});

      await runPromptFlow(baseFlow, executor, { prompt: fn, silent: true });

      const nameQ = calls.find((q: any) => q.name === 'name') as any;
      expect(typeof nameQ.validate).toBe('function');
      expect(nameQ.validate('')).toBe('Required');
      expect(nameQ.validate('alice')).toBe(true);
    });
  });
});
