/** Opt-in test: real builds and transactions using a fresh Friendbot-funded testnet key. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Keypair, Networks, rpc, StrKey } from '@stellar/stellar-sdk';
import { resolveNetwork } from '../../core/stellar-sdk/src/utils/network-utils';

const execute = promisify(execFile);
const testnet = process.env.GALAXY_DEPLOY_INTEGRATION === '1' ? describe : describe.skip;

testnet('galaxy deploy contract on testnet', () => {
  it('returns a confirmed contract that stellar contract info can resolve', async () => {
    const root = path.resolve(__dirname, '../../..');
    await execute('stellar', ['--version']);
    await execute('cargo', ['--version']);
    const network = resolveNetwork('testnet');
    if (network.networkPassphrase !== Networks.TESTNET) throw new Error('This test only runs on testnet');
    const signer = Keypair.random();
    const fundingUrl = new URL(network.friendbotUrl);
    fundingUrl.searchParams.set('addr', signer.publicKey());
    const response = await fetch(fundingUrl);
    if (!response.ok) throw new Error(`Friendbot failed: ${response.status}`);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'galaxy-live-deploy-'));
    try {
      await fs.cp(path.join(__dirname, '../fixtures/deploy'), path.join(directory, 'contracts', 'hello'), { recursive: true });
      const { stdout } = await execute(process.execPath, [
        '--import', path.join(root, 'node_modules/tsx/dist/loader.mjs'),
        path.join(root, 'tools/cli/src/index.ts'),
        '--non-interactive', 'deploy', 'contract', 'hello', '--network', 'testnet', '--json',
      ], {
        cwd: directory,
        env: { ...process.env, STELLAR_SECRET_KEY: signer.secret(), TSX_TSCONFIG_PATH: path.join(root, 'tools/cli/tsconfig.json') },
        timeout: 300000,
      });
      const result = JSON.parse(stdout);
      expect(StrKey.isValidContract(result.address)).toBe(true);
      expect(result.transactionHash).toMatch(/^[a-f0-9]{64}$/);
      const server = new rpc.Server(network.rpcUrl);
      expect((await server.getTransaction(result.transactionHash)).status).toBe('SUCCESS');
      const info = await execute('stellar', [
        'contract', 'info', 'interface', '--contract-id', result.address,
        '--rpc-url', network.rpcUrl, '--network-passphrase', network.networkPassphrase,
      ], { cwd: directory });
      expect(info.stdout).toContain('hello');
      const history = JSON.parse(await fs.readFile(path.join(directory, '.galaxy/deployments.json'), 'utf8'));
      expect(history).toEqual([result]);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 360000);
});
