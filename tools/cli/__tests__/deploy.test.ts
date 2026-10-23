import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { Account, Address, Keypair, Networks, Operation, rpc, StrKey, xdr } from '@stellar/stellar-sdk';
import { deployContract, submitDeploymentOperation } from '../src/utils/contract-deployment';
import { createDeployCommand } from '../src/commands/deploy';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
jest.mock('node:timers/promises', () => ({
  setInterval: async function* () { for (let i = 0; i < 60; i++) yield i; },
}));

describe('real contract deployment', () => {
  const signer = Keypair.random();
  const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));
  const savedEnv = { ...process.env };
  let directory: string;
  let getTransaction: jest.SpyInstance;
  let sendTransaction: jest.SpyInstance;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'galaxy-deploy-test-'));
    await fs.outputFile(path.join(directory, 'contracts', 'hello', 'Cargo.toml'), '[package]\nname="hello"');
    process.env.STELLAR_SECRET_KEY = signer.secret();
    delete process.env.STELLAR_RPC_URL;
    delete process.env.STELLAR_NETWORK_PASSPHRASE;
    (execFile as unknown as jest.Mock).mockImplementation((_file, args, options, callback) => {
      fs.outputFile(path.join(args[args.length - 1], 'hello.wasm'), Buffer.from([0, 97, 115, 109]))
        .then(() => callback(null, '', ''), callback);
    });
    jest.spyOn(rpc.Server.prototype, 'getAccount').mockResolvedValue(new Account(signer.publicKey(), '1'));
    jest.spyOn(rpc.Server.prototype, 'prepareTransaction').mockImplementation(async tx => tx);
    sendTransaction = jest.spyOn(rpc.Server.prototype, 'sendTransaction')
      .mockResolvedValueOnce({ status: 'PENDING', hash: 'a'.repeat(64) } as any)
      .mockResolvedValue({ status: 'PENDING', hash: 'b'.repeat(64) } as any);
    getTransaction = jest.spyOn(rpc.Server.prototype, 'getTransaction')
      .mockResolvedValueOnce({ status: 'NOT_FOUND' } as any)
      .mockResolvedValueOnce({ status: 'SUCCESS', returnValue: xdr.ScVal.scvBytes(Buffer.alloc(32, 1)) } as any)
      .mockResolvedValue({ status: 'SUCCESS', returnValue: Address.fromString(contractId).toScVal() } as any);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    process.env = { ...savedEnv };
    process.exitCode = 0;
    await fs.remove(directory);
  });

  it('builds WASM, waits for confirmation, and saves the returned address and hashes', async () => {
    const result = await deployContract('hello', { network: 'testnet' }, directory);
    expect(result).toMatchObject({ address: contractId, transactionHash: 'b'.repeat(64), uploadTransactionHash: 'a'.repeat(64) });
    expect(getTransaction).toHaveBeenCalledTimes(3);
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    const [binary, args, options] = (execFile as unknown as jest.Mock).mock.calls[0];
    expect(binary).toBe('stellar');
    expect(args.slice(0, 2)).toEqual(['contract', 'build']);
    expect(options.env.STELLAR_SECRET_KEY).toBeUndefined();
    expect(await fs.readJson(path.join(directory, '.galaxy', 'deployments.json'))).toEqual([result]);
    expect(await fs.pathExists(args[args.length - 1])).toBe(false);
  });

  it('uses centralized network overrides and preserves previous deployment history', async () => {
    process.env.STELLAR_RPC_URL = 'http://localhost:8000/rpc';
    process.env.STELLAR_NETWORK_PASSPHRASE = 'Local test network';
    await fs.outputJson(path.join(directory, '.galaxy', 'deployments.json'), [{ address: 'previous' }]);
    const result = await deployContract('hello', { network: 'futurenet' }, directory);
    expect(result.rpcUrl).toBe('http://localhost:8000/rpc');
    expect(sendTransaction.mock.calls[0][0].networkPassphrase).toBe('Local test network');
    expect(await fs.readJson(path.join(directory, '.galaxy', 'deployments.json'))).toHaveLength(2);
  });

  it.each(['ERROR', 'TRY_AGAIN_LATER'])('does not save success when submission returns %s', async status => {
    sendTransaction.mockReset().mockResolvedValue({ status, hash: 'rejected' });
    await expect(deployContract('hello', { network: 'testnet' }, directory)).rejects.toThrow('rejected');
    expect(await fs.pathExists(path.join(directory, '.galaxy', 'deployments.json'))).toBe(false);
  });

  it('does not deploy after an on-chain upload failure', async () => {
    getTransaction.mockReset().mockResolvedValue({ status: 'FAILED' });
    await expect(deployContract('hello', { network: 'testnet' }, directory)).rejects.toThrow('failed on chain');
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not save an address after contract creation fails', async () => {
    getTransaction.mockReset()
      .mockResolvedValueOnce({ status: 'SUCCESS', returnValue: xdr.ScVal.scvBytes(Buffer.alloc(32, 1)) })
      .mockResolvedValue({ status: 'FAILED' });
    await expect(deployContract('hello', { network: 'testnet' }, directory)).rejects.toThrow('failed on chain');
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(await fs.pathExists(path.join(directory, '.galaxy', 'deployments.json'))).toBe(false);
  });

  it('rejects successful RPC results without a contract address', async () => {
    getTransaction.mockReset()
      .mockResolvedValueOnce({ status: 'SUCCESS', returnValue: xdr.ScVal.scvBytes(Buffer.alloc(32, 1)) })
      .mockResolvedValue({ status: 'SUCCESS', returnValue: xdr.ScVal.scvVoid() });
    await expect(deployContract('hello', { network: 'testnet' }, directory)).rejects.toThrow('Missing contract address');
    expect(await fs.pathExists(path.join(directory, '.galaxy', 'deployments.json'))).toBe(false);
  });

  it('reports the real address and hash if saving a confirmed deployment fails', async () => {
    jest.spyOn(fs, 'writeJson').mockRejectedValue(new Error('disk full') as never);
    await expect(deployContract('hello', { network: 'testnet' }, directory))
      .rejects.toThrow(`Contract ${contractId} deployed in transaction ${'b'.repeat(64)}`);
  });

  it('times out pending confirmation without inventing a successful result', async () => {
    getTransaction.mockReset().mockResolvedValue({ status: 'NOT_FOUND' });
    await expect(submitDeploymentOperation(new rpc.Server('https://example.com'), signer,
      Networks.TESTNET, Operation.uploadContractWasm({ wasm: Buffer.from('wasm') }), 2, 1))
      .rejects.toThrow('Confirmation timed out');
    expect(getTransaction).toHaveBeenCalledTimes(2);
  });

  it('does not submit anything when the build fails', async () => {
    (execFile as unknown as jest.Mock).mockImplementation((_file, _args, _options, callback) => callback(new Error('build failed')));
    await expect(deployContract('hello', { network: 'testnet' }, directory)).rejects.toThrow('stellar contract build failed');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it.each(['../hello', '/hello', '..', 'hello;echo'])('rejects invalid contract names: %s', async name => {
    await expect(deployContract(name, { network: 'testnet' }, directory)).rejects.toThrow('directory name');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('rejects invalid networks and missing signing credentials before building', async () => {
    await expect(deployContract('hello', { network: 'typo' }, directory)).rejects.toThrow('Unsupported network');
    delete process.env.STELLAR_SECRET_KEY;
    await expect(deployContract('hello', { network: 'testnet' }, directory)).rejects.toThrow('Set STELLAR_SECRET_KEY');
    expect(execFile).not.toHaveBeenCalled();
  });

  it('rejects removed verify and app commands', async () => {
    const command = createDeployCommand().exitOverride().configureOutput({ writeErr: () => {} });
    for (const child of command.commands) child.exitOverride();
    await expect(command.parseAsync(['contract', 'hello', '--verify'], { from: 'user' })).rejects.toThrow('unknown option');
    await expect(command.parseAsync(['app'], { from: 'user' })).rejects.toThrow();
  });

  it('sets a nonzero exit code and emits JSON errors without success output', async () => {
    delete process.env.STELLAR_SECRET_KEY;
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await createDeployCommand().parseAsync(['contract', 'hello', '--json'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(output).not.toHaveBeenCalled();
    expect(JSON.parse(error.mock.calls[0][0])).toHaveProperty('error');
  });

  it('routes the public contract subcommand to the real deployment and prints one JSON result', async () => {
    jest.spyOn(process, 'cwd').mockReturnValue(directory);
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    await createDeployCommand().parseAsync(['contract', 'hello', '--network', 'testnet', '--json'], { from: 'user' });
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ address: contractId, transactionHash: 'b'.repeat(64) });
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });
});
