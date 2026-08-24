import { Bench } from 'tinybench';
import {
  encryptPrivateKey,
  decryptPrivateKey,
} from '../../../core/invisible-wallet/src/utils/encryption.utils.ts';

const SECRET = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const PASSWORD = 'BenchPassword1!';

export async function encryptionBench(): Promise<Bench> {
  const v2 = await encryptPrivateKey(SECRET, PASSWORD);
  process.env.ENCRYPTION_V2_ENABLED = 'false';
  const v1 = await encryptPrivateKey(SECRET, PASSWORD);
  delete process.env.ENCRYPTION_V2_ENABLED;

  const bench = new Bench({ time: 400, warmupTime: 50 });

  bench
    .add('encrypt v2 argon2id', async () => {
      delete process.env.ENCRYPTION_V2_ENABLED;
      await encryptPrivateKey(SECRET, PASSWORD);
    })
    .add('decrypt v2 argon2id', async () => {
      await decryptPrivateKey(v2, PASSWORD);
    })
    .add('encrypt v1 pbkdf2', async () => {
      process.env.ENCRYPTION_V2_ENABLED = 'false';
      await encryptPrivateKey(SECRET, PASSWORD);
    })
    .add('decrypt v1 pbkdf2', async () => {
      process.env.ENCRYPTION_V2_ENABLED = 'false';
      await decryptPrivateKey(v1, PASSWORD);
    });

  return bench;
}
