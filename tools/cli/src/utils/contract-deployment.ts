/** @fileoverview Soroban build, upload, deployment and confirmed deployment records. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { setInterval } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import {
  Address, BASE_FEE, Keypair, Operation, rpc, StrKey, TransactionBuilder, xdr,
} from '@stellar/stellar-sdk';
import {
  NETWORKS, resolveNetwork, type NetworkName,
} from '../../../../packages/core/stellar-sdk/src/utils/network-utils.js';

const execute = promisify(execFile);

export interface DeploymentOptions {
  network: string;
}

export interface DeploymentRecord {
  contract: string;
  address: string;
  network: NetworkName;
  rpcUrl: string;
  transactionHash: string;
  uploadTransactionHash: string;
  deployedAt: string;
}

/** Submit a prepared operation and wait for a definitive ledger result. */
export async function submitDeploymentOperation(
  server: rpc.Server,
  signer: Keypair,
  networkPassphrase: string,
  operation: xdr.Operation,
  attempts = 60,
  intervalMs = 1000,
): Promise<{ hash: string; result: rpc.Api.GetSuccessfulTransactionResponse }> {
  const account = await server.getAccount(signer.publicKey());
  const transaction = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(operation)
    .setTimebounds(0, Math.floor(Date.now() / 1000) + 120)
    .build();
  const prepared = await server.prepareTransaction(transaction);
  prepared.sign(signer);
  const sent = await server.sendTransaction(prepared);
  if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
    throw new Error(`Transaction ${sent.hash} was rejected (${sent.status})`);
  }
  let count = 0;
  for await (const tick of setInterval(intervalMs)) {
    void tick;
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash: sent.hash, result };
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction ${sent.hash} failed on chain`);
    }
    if (++count >= attempts) {
      throw new Error(`Confirmation timed out for transaction ${sent.hash}; check its status before retrying`);
    }
  }
  throw new Error('Transaction polling stopped');
}

/** Build a single contract and persist its real address only after successful deployment. */
export async function deployContract(
  contractName: string,
  options: DeploymentOptions,
  projectDir = process.cwd(),
): Promise<DeploymentRecord> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(contractName)) {
    throw new Error('Contract name must be a directory name under contracts/');
  }
  if (!Object.prototype.hasOwnProperty.call(NETWORKS, options.network)) {
    throw new Error(`Unsupported network: ${options.network}`);
  }
  const network = resolveNetwork(options.network as NetworkName);
  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) throw new Error('Set STELLAR_SECRET_KEY to a funded deployment account');
  let signer: Keypair;
  try {
    signer = Keypair.fromSecret(secret);
  } catch {
    throw new Error('STELLAR_SECRET_KEY is not a valid Stellar secret key');
  }
  const contractPath = path.join(projectDir, 'contracts', contractName);
  const manifest = path.join(contractPath, 'Cargo.toml');
  if (!await fs.pathExists(manifest)) throw new Error(`Contract manifest not found: ${manifest}`);
  const deploymentPath = path.join(projectDir, '.galaxy', 'deployments.json');
  const deployments: DeploymentRecord[] = await fs.pathExists(deploymentPath)
    ? await fs.readJson(deploymentPath) : [];
  if (!Array.isArray(deployments)) throw new Error('Deployment history must be a JSON array');

  // A fresh output directory prevents accidentally deploying a stale artifact.
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'galaxy-deploy-'));
  let wasm: Buffer;
  try {
    const buildEnv = { ...process.env };
    delete buildEnv.STELLAR_SECRET_KEY;
    try {
      await execute('stellar', ['contract', 'build', '--manifest-path', manifest, '--out-dir', outputDir], {
        cwd: contractPath, env: buildEnv, maxBuffer: 10 * 1024 * 1024,
      });
    } catch {
      throw new Error('stellar contract build failed; check stellar/Rust installation and build the contract directly for diagnostics');
    }
    const files = (await fs.readdir(outputDir)).filter(file => file.endsWith('.wasm'));
    if (files.length !== 1) throw new Error(`Expected one built WASM artifact, found ${files.length}`);
    wasm = await fs.readFile(path.join(outputDir, files[0]));
  } finally {
    await fs.remove(outputDir);
  }

  const server = new rpc.Server(network.rpcUrl, { allowHttp: network.rpcUrl.startsWith('http://') });
  const upload = await submitDeploymentOperation(server, signer, network.networkPassphrase,
    Operation.uploadContractWasm({ wasm }));
  const wasmHash = upload.result.returnValue?.bytes();
  if (!wasmHash || wasmHash.length !== 32) throw new Error(`Missing WASM hash in transaction ${upload.hash}`);
  const deployed = await submitDeploymentOperation(server, signer, network.networkPassphrase,
    Operation.createCustomContract({
      address: Address.fromString(signer.publicKey()), wasmHash, salt: randomBytes(32),
    }));
  const value = deployed.result.returnValue;
  if (!value || value.switch().name !== 'scvAddress') {
    throw new Error(`Missing contract address in transaction ${deployed.hash}`);
  }
  const address = Address.fromScVal(value).toString();
  if (!StrKey.isValidContract(address)) throw new Error(`Invalid contract address in transaction ${deployed.hash}`);
  const record: DeploymentRecord = {
    contract: contractName, address, network: network.name, rpcUrl: network.rpcUrl,
    transactionHash: deployed.hash, uploadTransactionHash: upload.hash,
    deployedAt: new Date().toISOString(),
  };
  try {
    await fs.ensureDir(path.dirname(deploymentPath));
    const latest = await fs.pathExists(deploymentPath) ? await fs.readJson(deploymentPath) : [];
    if (!Array.isArray(latest)) throw new Error('Deployment history must be a JSON array');
    await fs.writeJson(deploymentPath, [...latest, record], { spaces: 2 });
  } catch {
    throw new Error(`Contract ${address} deployed in transaction ${deployed.hash}, but deployment history could not be saved`);
  }
  return record;
}
