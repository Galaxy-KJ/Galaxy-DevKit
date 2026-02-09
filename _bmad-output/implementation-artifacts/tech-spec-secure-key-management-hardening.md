---
title: 'Secure Key Management Hardening'
slug: 'secure-key-management-hardening'
created: '2026-02-08'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['node:crypto', 'argon2@^0.44.0', '@stellar/stellar-sdk@^14.5.0', 'bip39@^3.1.0', 'ed25519-hd-key@^1.3.0', 'jest@^30.2.0', 'ts-jest@^29.4.6 (verify compat with Jest 30)', 'typescript@^5.9.3']
files_to_modify: ['packages/core/invisible-wallet/src/utils/encryption.utils.ts', 'packages/core/invisible-wallet/src/services/key-managment.service.ts', 'packages/core/invisible-wallet/src/services/invisible-wallet.service.ts', 'packages/core/stellar-sdk/src/utils/encryption.utils.ts', 'packages/core/stellar-sdk/src/services/stellar-service.ts', 'packages/core/stellar-sdk/src/claimable-balances/claimable-balance-manager.ts', 'packages/core/stellar-sdk/src/liquidity-pools/liquidity-pool-manager.ts', 'packages/core/stellar-sdk/src/path-payments/path-payment-manager.ts', 'packages/core/stellar-sdk/src/test/encryption.test.ts', 'packages/core/invisible-wallet/src/test/invisible.test.ts', 'packages/core/invisible-wallet/src/test/key-management.test.ts', 'packages/core/invisible-wallet/src/backup/test/encryption.test.ts']
code_patterns: ['AES-256-GCM authenticated encryption', 'PBKDF2 key derivation (100k iterations)', 'decrypt-on-demand pattern for transaction signing', 'Supabase as remote storage backend', 'in-memory Map for session caching', 'BIP39/BIP44 key derivation (m/44p/148p/np)', 'timing-safe comparison for secrets']
test_patterns: ['jest with ts-jest', 'unit tests in src/test/ directories', 'integration tests with .integration.test.ts suffix', 'mocking of decryptPrivateKey in service tests', '30+ existing encryption test cases in stellar-sdk']
---

# Tech-Spec: Secure Key Management Hardening

**Created:** 2026-02-08

## Overview

### Problem Statement

The invisible wallet's key generation and storage system contains multiple security vulnerabilities that put user funds at risk:

1. **CRITICAL** — `generateRandomPassword()` uses `Math.random()` instead of `crypto.randomBytes()`, producing predictable passwords.
2. **CRITICAL** — `createSession()` never saves sessions to the in-memory `activeSessions` Map, so `validateSession()` always fails.
3. **CRITICAL** — `changePassword()` writes to the `wallets` table instead of `invisible_wallets`, causing silent failure on password changes.
4. **HIGH** — Private keys are encrypted with PBKDF2 at 100k iterations (OWASP recommends 600k+ for SHA-256) and stored on a remote server (Supabase), making offline brute-force feasible if the DB is compromised. On 8x RTX 4090, ~2M PBKDF2-SHA256 hashes/sec.
5. **HIGH** — Decrypted private keys are not zeroed from memory after use, leaving them exposed to memory scraping.
6. **MEDIUM** — Session tokens are stored in plaintext in Supabase — a DB compromise exposes all active sessions.
7. **MEDIUM** — No rate-limiting on password verification allows unlimited brute-force attempts.
8. **LOW** — Duplicated encryption utilities between `invisible-wallet` and `stellar-sdk` create maintenance risk and inconsistency.

### Solution

Fix all identified vulnerabilities: replace insecure RNG, fix session and password-change bugs, migrate encryption to Argon2id with backward-compatible PBKDF2 migration, hash session tokens before DB storage, add in-memory rate-limiting (zero key material cached), zeroize decrypted keys after use, and unify duplicated encryption code across packages.

### Scope

**In Scope:**

1. Replace `Math.random()` with `crypto.randomBytes()` in `generateRandomPassword()`
2. Fix `createSession()` to save sessions to the in-memory Map
3. Fix `changePassword()` to write to `invisible_wallets` table (not `wallets`)
4. Migrate main encryption from PBKDF2-100k to Argon2id
5. Implement format versioning for backward-compatible PBKDF2→Argon2id migration (transparent re-encryption on unlock)
6. Hash session tokens (SHA-256) before storing in Supabase
7. Add in-memory rate-limiting on password verification (attempt counter + lockout only, ZERO key material)
8. Add key zeroization — `buffer.fill(0)` after every decrypt operation
9. Unify encryption utils between `invisible-wallet` and `stellar-sdk` into a single shared source
10. Ensure no private key data leaks into caches, cookies, logs, error messages, or persistent storage

**Out of Scope:**

- CLI wallet encryption (scrypt-based, separate module)
- Social Recovery inline crypto refactor
- UI/frontend changes
- Database schema migrations
- Backup format changes (already uses Argon2id)

## Context for Development

### Codebase Patterns

- **Encryption pattern**: AES-256-GCM with PBKDF2 key derivation. Current v1 format: `salt:iv:authTag:ciphertext` (all base64). New v2 format: `v2:salt:iv:authTag:argon2Params:ciphertext` (argon2Params = base64 JSON of `{m,t,p}`). Constants: IV=12 bytes, Salt=16 bytes, Key=32 bytes.
- **Decrypt-on-demand**: All transaction-signing methods decrypt the private key immediately before signing, then discard the variable (but don't zero it). Pattern: `const decrypted = decryptPrivateKey(wallet.privateKey, password); const keypair = Keypair.fromSecret(decrypted);`
- **Session management**: `KeyManagementService` maintains an in-memory `Map<string, WalletSession>` plus persists to Supabase `wallet_sessions` table. Sessions expire after configurable timeout (default 1 hour). Cleanup runs every 60 seconds.
- **Password validation**: Enforces min 8 chars, uppercase, lowercase, number. Evaluates strength score (WEAK/MEDIUM/STRONG/VERY_STRONG).
- **Test pattern**: Jest with ts-jest. Tests in `src/test/` directories. Encryption tests mock-free (test real crypto). Service tests mock `decryptPrivateKey`.
- **No shared packages**: There is no `packages/core/shared` or common crypto package. Code is duplicated between invisible-wallet and stellar-sdk.
- **Path aliases**: `@galaxy/core/*` maps to `packages/core/*/src` (defined in root tsconfig.json).
- **Argon2 dependency**: Only invisible-wallet has `argon2@^0.44.0`. Stellar-sdk does NOT have it — unification requires having stellar-sdk import from invisible-wallet.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/core/invisible-wallet/src/utils/encryption.utils.ts` | Main encryption utils — 14 exported functions including encrypt/decrypt, password validation, session tokens, HMAC |
| `packages/core/invisible-wallet/src/services/key-managment.service.ts` | Key management, session management, wallet backup — has `createSession` bug (L124-163), `changePassword` bug (L306-310). **Note:** Filename contains a typo ("managment" → should be "management"). Do NOT rename in this spec — it would break imports across the codebase. Track as a separate cleanup task. |
| `packages/core/invisible-wallet/src/services/invisible-wallet.service.ts` | Wallet lifecycle — consumes KeyManagementService, calls validatePassword |
| `packages/core/stellar-sdk/src/utils/encryption.utils.ts` | Duplicated encrypt/decrypt (60 lines) — consumed by 4 stellar-sdk modules |
| `packages/core/stellar-sdk/src/services/stellar-service.ts` | Uses `decryptPrivateKey` in sendPayment (L326), createAccount (L406), addTrustline (L615) |
| `packages/core/stellar-sdk/src/claimable-balances/claimable-balance-manager.ts` | Uses `decryptPrivateKey` in createClaimableBalance (L67), claimBalance (L145) |
| `packages/core/stellar-sdk/src/liquidity-pools/liquidity-pool-manager.ts` | Uses `decryptPrivateKey` in depositLiquidity (L87), withdrawLiquidity (L179) |
| `packages/core/stellar-sdk/src/path-payments/path-payment-manager.ts` | Uses `decryptPrivateKey` in swap execution (L132) |
| `packages/core/invisible-wallet/src/backup/encryption/argon2-provider.ts` | Existing Argon2id implementation — reuse for main encryption migration |
| `packages/core/invisible-wallet/src/backup/types/backup-types.ts` | Constants: DEFAULT_ARGON2_MEMORY_COST=65536, TIME_COST=3, PARALLELISM=4 |
| `packages/core/invisible-wallet/src/types/wallet.types.ts` | EncryptedData, KeyDerivationParams, PasswordStrength, WalletSession types |
| `packages/core/stellar-sdk/src/test/encryption.test.ts` | 30+ test cases for encrypt/decrypt — must be updated for async + Argon2id |
| `packages/core/invisible-wallet/src/test/invisible.test.ts` | InvisibleWalletService integration tests |
| `packages/core/invisible-wallet/index.ts` | Re-exports all encryption utils — public API surface |

### Technical Decisions

- **Argon2id** chosen as primary KDF — already a dependency via `argon2@^0.44.0` in invisible-wallet. Memory-hard (64MB/attempt) defeats GPU parallelism.
- **Rate-limiting** stores ONLY `{ attempts: number, lockedUntil: Date }` per walletId in memory — never private keys, passwords, or any key material. 5 attempts then 15min lockout.
- **Session token hashing** uses SHA-256 (unsalted) before DB storage; in-memory Map retains raw tokens for fast validation. Unsalted SHA-256 is acceptable here because `generateSessionToken()` produces 48 bytes (384 bits) of `crypto.randomBytes` entropy — far too large for rainbow tables or precomputation attacks. No salt needed.
- **Migration strategy** — Format version prefix on encrypted data. v1 = `salt:iv:authTag:ciphertext` (PBKDF2). v2 = `v2:salt:iv:authTag:argon2Params:ciphertext` (Argon2id). Decryption auto-detects format. **Re-encryption trigger**: v1→v2 migration happens on `unlockWallet()` (not just password change). On successful unlock with v1, transparently re-encrypt with v2 and persist to Supabase. If Supabase update fails, unlock still succeeds and re-encryption retries on next unlock. New encryptions always use v2. Password change also produces v2 (via `encryptPrivateKey` which always uses v2).
- **Key zeroization** — Decrypted keys are JS strings (immutable). Strategy: return `Buffer` from decrypt, provide `withDecryptedKey(encryptedKey, password, callback)` utility that handles zeroization in a `finally` block automatically. All consumers use this wrapper.
- **Known limitation: string copies** — Inside `withDecryptedKey` callbacks, `keyBuffer.toString('utf8')` creates an immutable JS string copy of the key that CANNOT be zeroed. This is a fundamental V8/JS limitation. We zero the Buffer to reduce exposure window, but the string copy persists until GC collects it. This is documented as an accepted residual risk — mitigated by: (a) keeping the string scope as narrow as possible (inside callback only), (b) not storing the string in any variable that outlives the callback, (c) the key being further transformed into a Stellar Keypair object immediately.
- **Error uniformity** — All decryption failures return "Invalid password or corrupted key data" regardless of actual cause (already implemented, must be preserved).
- **Unification approach** — Keep encryption utils in `invisible-wallet` as canonical source. Replace `stellar-sdk/src/utils/encryption.utils.ts` with re-exports from invisible-wallet.
- **Async migration** — Argon2id's `argon2.hash()` is async. `encryptPrivateKey`/`decryptPrivateKey` must become async. All 8+ consumer files need `await` added. PBKDF2 fallback for decryption remains sync internally but wrapped in async interface.
- **Argon2 load failure behavior** — If the `argon2` native module fails to load at runtime (e.g., missing native bindings, unsupported platform), the module must: (1) Log a CRITICAL warning at startup, (2) Allow **decryption** of both v1 (PBKDF2) and v2 keys using a PBKDF2-only fallback (degrade gracefully — users can still access funds), (3) **Reject new encryptions** with a clear error ("Argon2id unavailable — cannot create secure encryption. Install argon2 native module."). This prevents silently falling back to weaker encryption for new keys while preserving access to existing keys. Add a top-level `let argon2Available = false` flag set during dynamic import attempt.

### Security Analysis (Advanced Elicitation Results)

#### Threat Model

| Attack Vector | Current Risk | Post-Fix Risk | Defense |
|---|---|---|---|
| DB compromise + offline brute-force | CRITICAL | LOW | Argon2id (64MB/attempt defeats GPU) |
| Session replay from DB dump | HIGH | LOW | SHA-256 hashed tokens in DB |
| Online password brute-force | MEDIUM | LOW | Rate-limiting (5 attempts, 15min lockout) |
| `Math.random()` prediction | CRITICAL | ELIMINATED | `crypto.randomBytes()` replacement |
| Memory scraping for decrypted keys | MEDIUM | LOW | Key zeroization after use |
| Migration downgrade attack | N/A | LOW | Format version detection, reject PBKDF2 for new encryptions |
| Error oracle (different error messages) | LOW | LOW | Uniform error messages (already implemented) |

#### Design Principles

1. **The private key is toxic** — minimize time in memory, never log, never cache, zero immediately after signing
2. **Defense in depth** — even if DB is compromised, Argon2id must hold
3. **Backward compatibility is non-negotiable** — existing PBKDF2 users seamlessly migrate on next unlock
4. **The rate limiter must NEVER touch key material** — counters and timestamps only

## Implementation Plan

### Tasks

Tasks are ordered by dependency — lowest-level changes first, consumers last.

- [ ] **Task 1: Fix `generateRandomPassword()` — replace `Math.random()` with CSPRNG**
  - File: `packages/core/invisible-wallet/src/utils/encryption.utils.ts`
  - Action: In `generateRandomPassword()` (L294-316), replace all `Math.floor(Math.random() * ...)` calls with `crypto.randomInt(...)` or equivalent using `crypto.randomBytes()`. Replace the Fisher-Yates shuffle (`Math.random() - 0.5`) with a proper `crypto.randomBytes()`-based shuffle.
  - Notes: `crypto.randomInt(min, max)` is available in Node.js 14.10+. Use it for index selection. For the shuffle, implement a Durstenfeld shuffle using `crypto.randomBytes()` for random indices.

- [ ] **Task 2: Migrate `encryptPrivateKey` to Argon2id with format versioning**
  - File: `packages/core/invisible-wallet/src/utils/encryption.utils.ts`
  - Action:
    1. Add `import argon2 from 'argon2'` at top
    2. Define format constants: `const ENCRYPTION_VERSION_PREFIX = 'v2:'` and Argon2 params: `ARGON2_MEMORY_COST = 65536`, `ARGON2_TIME_COST = 3`, `ARGON2_PARALLELISM = 4`
    3. Make `encryptPrivateKey` async. Use `argon2.hash(password, { type: argon2.argon2id, memoryCost, timeCost, parallelism, salt, raw: true, hashLength: 32 })` for key derivation. Output format: `v2:salt:iv:authTag:argon2Params:ciphertext` where `argon2Params` is a base64-encoded JSON string of `{m:memoryCost,t:timeCost,p:parallelism}`. Embedding params in the ciphertext ensures future parameter tuning doesn't break existing keys and enables the rollback plan.
    4. Make `decryptPrivateKey` async. Auto-detect format: if string starts with `v2:`, use Argon2id path; otherwise fall back to PBKDF2 (existing logic) for backward compatibility
    5. Return `Buffer` instead of `string` from decrypt to enable zeroization. Do NOT add a `decryptPrivateKeyToString` convenience wrapper — all consumers must use `withDecryptedKey` which handles zeroization. A string-returning wrapper would be an unsafe escape hatch that bypasses the zeroization pattern.
    6. Make `encryptData`/`decryptData` async with same Argon2id migration. **Consumer audit completed**: The only external usages of `encryptData`/`decryptData` are in `packages/core/wallet/src/recovery/` (SocialRecovery.ts, NotificationService.ts), but these define their OWN local `encryptData`/`decryptData` functions — they are NOT consumers of the invisible-wallet exports. Therefore, no additional files need `await` updates beyond those already listed in Tasks 8-11. The Social Recovery encryption is explicitly out of scope.
    7. Keep `hashPassword`/`verifyPassword`/`deriveKey` using PBKDF2 (they're for password hashing, not key encryption)
  - Notes: Argon2 `raw: true` returns a Buffer key directly. The existing AES-256-GCM cipher/decipher logic stays the same — only the KDF changes.

- [ ] **Task 2b: Implement `ENCRYPTION_V2_ENABLED` rollback flag**
  - File: `packages/core/invisible-wallet/src/utils/encryption.utils.ts`
  - Action:
    1. Add `const ENCRYPTION_V2_ENABLED = process.env.ENCRYPTION_V2_ENABLED !== 'false';` (defaults to `true`)
    2. In `encryptPrivateKey`: if `!ENCRYPTION_V2_ENABLED`, use PBKDF2 (v1 format) instead of Argon2id. This is the rollback lever.
    3. `decryptPrivateKey` always handles both v1 and v2 regardless of the flag (read path must never break).
    4. In `unlockWallet` v1→v2 re-encryption (Task 9): skip re-encryption if `!ENCRYPTION_V2_ENABLED`.
  - Notes: This allows instant rollback by setting `ENCRYPTION_V2_ENABLED=false` without code deployment. Only affects new encryptions — existing v2 keys remain accessible.

- [ ] **Task 2c: Implement Argon2 graceful degradation on load failure**
  - File: `packages/core/invisible-wallet/src/utils/encryption.utils.ts`
  - Action:
    1. Replace static `import argon2 from 'argon2'` with a dynamic import at module load: `let argon2Module: typeof import('argon2') | null = null; let argon2Available = false;` Initialize via top-level async IIFE or lazy init on first use: `try { argon2Module = await import('argon2'); argon2Available = true; } catch { console.error('CRITICAL: argon2 native module failed to load. New encryptions will be rejected. Decryption of existing keys will use PBKDF2 fallback.'); }`
    2. In `encryptPrivateKey`: if `!argon2Available`, throw `new Error('Argon2id unavailable — cannot create secure encryption. Install argon2 native module.')`
    3. In `decryptPrivateKey`: if format is v2 and `!argon2Available`, fall back to extracting Argon2 params from ciphertext and using PBKDF2 with high iterations as degraded fallback (users can still access funds). Log a warning on each degraded decryption.
    4. Export `isArgon2Available(): boolean` for consumers to check availability.
  - Notes: This ensures the module doesn't hard-crash on platforms without native build tools. Decryption always works; only new encryption is blocked.

- [ ] **Task 3: Add `withDecryptedKey` utility for safe key zeroization**
  - File: `packages/core/invisible-wallet/src/utils/encryption.utils.ts`
  - Action: Add new exported async function:
    ```
    async function withDecryptedKey<T>(
      encryptedKey: string,
      password: string,
      callback: (keyBuffer: Buffer) => T | Promise<T>
    ): Promise<T>
    ```
    Implementation: decrypt to Buffer, call callback in try block, zero buffer with `buffer.fill(0)` in finally block. This ensures key material is always cleaned up regardless of success/failure.
  - Notes: All decrypt consumers should migrate to this pattern. The callback receives a Buffer; for Stellar operations, convert to string inside the callback scope: `const keypair = Keypair.fromSecret(keyBuffer.toString('utf8'))`. **Error uniformity**: If the callback throws (e.g., `Keypair.fromSecret()` rejects a corrupted key string), `withDecryptedKey` must catch the error, zero the buffer in `finally`, and re-throw a uniform error: `"Invalid password or corrupted key data"`. This prevents Stellar SDK internal error messages from leaking crypto state. Implementation: wrap the callback invocation in try/catch, and in the catch block, re-throw the uniform error message (preserving the original as `cause` for debugging).

- [ ] **Task 4: Add rate-limiting to `KeyManagementService`**
  - File: `packages/core/invisible-wallet/src/services/key-managment.service.ts`
  - Action:
    1. Add private property: `private rateLimiter: Map<string, { attempts: number; lockedUntil: Date | null }> = new Map()`
    2. Add constants: `MAX_ATTEMPTS = 5`, `LOCKOUT_DURATION = 15 * 60 * 1000` (15 minutes)
    3. Add private method `checkRateLimit(walletId: string): void` that throws if locked out
    4. Add private method `recordFailedAttempt(walletId: string): void` that increments counter and sets lockout after MAX_ATTEMPTS
    5. Add private method `resetRateLimit(walletId: string): void` that clears on successful auth
    6. Call `checkRateLimit` at the start of `verifyPassword()` and `retrievePrivateKey()` (before any crypto operations)
    7. Call `recordFailedAttempt` on decryption failure, `resetRateLimit` on success
    8. Add rate limiter cleanup to the existing session cleanup timer (clear entries older than LOCKOUT_DURATION)
    9. In the `dispose()` method: add explicit `this.rateLimiter.clear()` to clean up the rate limiter Map on service shutdown
  - Notes: **CRITICAL — The rate limiter Map stores ONLY walletId → { attempts, lockedUntil }. NEVER store passwords, keys, encrypted data, or any key material in this Map.**

- [ ] **Task 5: Fix `createSession()` — save to in-memory Map + handle persistence failures**
  - File: `packages/core/invisible-wallet/src/services/key-managment.service.ts`
  - Action:
    1. In `createSession()` method (L124-163), add `this.activeSessions.set(sessionToken, session)` immediately after creating the session object (after L140, before the Supabase insert). This ensures the session is available for `validateSession()` lookups.
    2. If the Supabase insert fails, log a warning but keep the session in the in-memory Map (the Map is the primary validation source; Supabase is for persistence/recovery). The existing session cleanup timer will eventually purge expired sessions from both.
    3. Add a periodic Supabase session orphan cleanup: during the existing 60-second cleanup cycle, delete rows from `wallet_sessions` where `expires_at < NOW()`. This prevents stale sessions from accumulating in the DB if the in-memory Map was the only place they were cleaned up. **Schema assumption**: This requires that the `wallet_sessions` table has an `expires_at` column (timestamp). Verify this column exists before implementation. If it does not exist, use `created_at + interval '1 hour'` as the expiry condition instead, matching the default session timeout.
  - Notes: This dual approach ensures: (a) the createSession bug is fixed, (b) sessions always work even if Supabase is temporarily unavailable, (c) Supabase doesn't accumulate orphaned expired rows.

- [ ] **Task 6: Fix `changePassword()` — correct Supabase table name**
  - File: `packages/core/invisible-wallet/src/services/key-managment.service.ts`
  - Action: In `changePassword()` method (L306-310), change `.from('wallets')` to `.from('invisible_wallets')`. Also change the column name from `privateKey` to `encrypted_private_key` to match the actual schema used in `invisible-wallet.service.ts`.
  - Notes: The current code silently fails because the `wallets` table either doesn't exist or has no matching rows.

- [ ] **Task 7: Hash session tokens before Supabase storage**
  - File: `packages/core/invisible-wallet/src/services/key-managment.service.ts`
  - Action:
    1. Add helper: `private hashToken(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }`
    2. In `createSession()`: store `this.hashToken(sessionToken)` as `session_token` in Supabase (not the raw token)
    3. In `revokeSession()`: use `this.hashToken(sessionToken)` in the `.eq('session_token', ...)` query
    4. In `refreshSession()`: use `this.hashToken(sessionToken)` in the `.eq('session_token', ...)` query
    5. In `revokeAllWalletSessions()`: no change needed (uses `wallet_id`, not `session_token`)
    6. The in-memory `activeSessions` Map continues to use raw tokens as keys (for fast O(1) lookup without hashing on every validation)
  - Notes: This means the raw token is only ever in memory. If Supabase is compromised, attackers get hashed tokens which cannot be used to authenticate.

- [ ] **Task 8: Make `KeyManagementService` methods async for Argon2id**
  - File: `packages/core/invisible-wallet/src/services/key-managment.service.ts`
  - Action:
    1. `storePrivateKey()` → `async storePrivateKey()` with `await encryptPrivateKey()`
    2. `retrievePrivateKey()` → `async retrievePrivateKey()` with `await decryptPrivateKey()`
    3. `verifyPassword()` → `async verifyPassword()` with `await decryptPrivateKey()`
    4. `exportWalletBackup()` → `async exportWalletBackup()` with `await encryptPrivateKey()`
    5. `importWalletBackup()` → `async importWalletBackup()` with `await decryptPrivateKey()`
    6. Update `changePassword()` to `await` the now-async `retrievePrivateKey` and `storePrivateKey`
  - Notes: These methods were sync before. Callers in `invisible-wallet.service.ts` already use `await` for most calls, but verify each call site.

- [ ] **Task 9: Update `invisible-wallet.service.ts` for async encryption**
  - File: `packages/core/invisible-wallet/src/services/invisible-wallet.service.ts`
  - Action:
    1. In `createWallet()` (L78-82): add `await` to `this.keyManagement.storePrivateKey()`
    2. In `createWalletFromMnemonic()` (L165-170): add `await` to both `storePrivateKey()` calls
    3. In `unlockWallet()` (L259): add `await` to `this.keyManagement.verifyPassword()`. Additionally, after successful verification, check if the encrypted key uses v1 format (no `v2:` prefix). If v1, transparently re-encrypt with Argon2id (v2) and update Supabase. Wrap re-encryption in try/catch — if it fails, log a warning but do NOT block the unlock. The re-encryption will be retried on next unlock.
    4. In `signTransaction()` (L720-721): refactor to use `withDecryptedKey` pattern:
       ```
       await withDecryptedKey(wallet.encryptedPrivateKey, password, async (keyBuffer) => {
         const keypair = Keypair.fromSecret(keyBuffer.toString('utf8'));
         transaction.sign(keypair);
       });
       ```
       Note: Do NOT call `keyBuffer.fill(0)` inside the callback — `withDecryptedKey` handles zeroization in its `finally` block. Doing it inside would zero the buffer before the callback finishes if any async work follows.
    5. In `exportBackup()` (L757): add `await` to `this.keyManagement.exportWalletBackup()`
  - Notes: Verify all `this.keyManagement.*` calls are properly awaited.

- [ ] **Task 10: Unify stellar-sdk encryption — replace with re-exports**
  - File: `packages/core/stellar-sdk/src/utils/encryption.utils.ts`
  - Action: Replace entire file content with:
    ```
    export { encryptPrivateKey, decryptPrivateKey, withDecryptedKey } from '@galaxy/core/invisible-wallet/utils/encryption.utils';
    ```
  - Notes: Use the `@galaxy/core/*` path alias (defined in root `tsconfig.json`) instead of fragile relative paths like `../../../`. This alias maps to `packages/core/*/src`. Must also export `withDecryptedKey` since Task 11 consumers need it. All 4 stellar-sdk consumers continue importing from the same local path — no import changes needed in consumers. The stellar-sdk `package.json` does NOT need `argon2` added because it's resolved through the invisible-wallet dependency at runtime. **IMPORTANT**: Verify that `stellar-sdk/package.json` declares `@galaxy/core/invisible-wallet` (or equivalent workspace reference) as a dependency. If using a strict package manager (pnpm), undeclared cross-package imports will fail at install time even if they resolve via tsconfig aliases at compile time. If not declared, add it as a workspace dependency: `"@galaxy/core/invisible-wallet": "workspace:*"`. **Verify**: Confirm the alias resolves correctly in Jest (via `moduleNameMapper`), TypeScript compilation, AND `pnpm install`.

- [ ] **Task 11: Update stellar-sdk consumers for async decrypt + key zeroization**
  - Files:
    - `packages/core/stellar-sdk/src/services/stellar-service.ts`
    - `packages/core/stellar-sdk/src/claimable-balances/claimable-balance-manager.ts`
    - `packages/core/stellar-sdk/src/liquidity-pools/liquidity-pool-manager.ts`
    - `packages/core/stellar-sdk/src/path-payments/path-payment-manager.ts`
  - Action: For each file, update every `decryptPrivateKey` call to use `withDecryptedKey` pattern. Example for `stellar-service.ts` `sendPayment()` (L326-331):
    ```
    // Before:
    const decrypted_private_key = decryptPrivateKey(wallet.privateKey, password);
    const keypair = Keypair.fromSecret(decrypted_private_key);

    // After:
    import { withDecryptedKey } from '../utils/encryption.utils.js';
    // ... inside method:
    const keypair = await withDecryptedKey(wallet.privateKey, password, (keyBuffer) => {
      return Keypair.fromSecret(keyBuffer.toString('utf8'));
    });
    ```
    Apply same pattern to:
    - `stellar-service.ts`: sendPayment (L326), createAccount (L406), addTrustline (L615)
    - `claimable-balance-manager.ts`: createClaimableBalance (L67), claimBalance (L145)
    - `liquidity-pool-manager.ts`: depositLiquidity (L87), withdrawLiquidity (L179)
    - `path-payment-manager.ts`: swap execution (L132)
  - Notes: Import `withDecryptedKey` from the same encryption.utils path (which now re-exports from invisible-wallet). The `withDecryptedKey` re-export must be added to Task 10.

- [ ] **Task 12: Update encryption tests for async + Argon2id + security fixes**
  - Files:
    - `packages/core/stellar-sdk/src/test/encryption.test.ts`
    - `packages/core/invisible-wallet/src/test/invisible.test.ts` (verify still passes)
  - Action:
    1. In `encryption.test.ts`: make all `encryptPrivateKey`/`decryptPrivateKey` calls use `await`. Add test cases:
       - Argon2id encryption produces `v2:` prefixed output
       - PBKDF2 v1 format is still decryptable (backward compat)
       - v1 encrypted data can be decrypted and re-encrypted as v2
       - `generateRandomPassword()` output is cryptographically random (statistical test: call 1000 times, verify uniform distribution)
       - `withDecryptedKey` zeros the buffer after callback completes
       - `withDecryptedKey` zeros the buffer even on callback error
    2. Add new test file `packages/core/invisible-wallet/src/test/key-management.test.ts`:
       - `createSession` saves to activeSessions Map
       - `validateSession` returns valid for active session
       - `changePassword` writes to `invisible_wallets` table
       - Rate limiter blocks after 5 failed attempts
       - Rate limiter resets after successful auth
       - Rate limiter unlocks after 15 minutes
       - Session token is hashed in Supabase insert (mock and verify)
       - Rate limiter Map contains ONLY { attempts, lockedUntil } — no key material
  - Notes: Argon2id tests will be slower (~100ms per encrypt/decrypt). Set appropriate Jest timeouts.

- [ ] **Task 13: Verify no key material leakage**
  - Files: All modified files
  - Action:
    1. Grep all `console.log`, `console.error`, `console.warn` in modified files — verify none log key material, passwords, encrypted data, or decrypted data
    2. Verify error messages are generic: "Invalid password or corrupted key data", "Failed to create wallet", etc. — no internal state leakage
    3. Verify `withDecryptedKey` callback scope doesn't leak Buffer reference to outer scope
    4. Verify rate limiter Map contents in debugger — confirm only `{ attempts, lockedUntil }`
  - Notes: This is a manual review task. Can be partially automated with grep for `console.*private|secret|key|password|encrypted|decrypted`.

### Acceptance Criteria

**Critical Bug Fixes:**

- [ ] AC-1: Given `generateRandomPassword()` is called 1000 times, when outputs are analyzed, then no statistical bias is detected (chi-squared test on character distribution) and `Math.random` is not used anywhere in the function.
- [ ] AC-2: Given a wallet is created and `createSession()` is called, when `validateSession()` is called with the returned token, then it returns `{ valid: true }`.
- [ ] AC-3: Given a wallet exists and `changePassword()` is called with valid old/new passwords, when the Supabase update is executed, then it targets the `invisible_wallets` table with column `encrypted_private_key`.

**Argon2id Migration:**

- [ ] AC-4: Given a new private key is encrypted with `encryptPrivateKey()`, when the output is inspected, then it starts with `v2:` prefix and uses Argon2id KDF (memoryCost=65536, timeCost=3, parallelism=4).
- [ ] AC-5: Given a private key was previously encrypted with PBKDF2 (v1 format without `v2:` prefix), when `decryptPrivateKey()` is called, then it successfully decrypts using the PBKDF2 fallback path.
- [ ] AC-6: Given a v1-encrypted key is successfully decrypted during wallet unlock, when the unlock succeeds, then re-encryption to v2 (Argon2id) is attempted before the unlock response is returned. If re-encryption and Supabase persist succeed, subsequent unlocks use v2 path. The re-encryption is best-effort — unlock success does NOT depend on it (see AC-6b).
- [ ] AC-6b: Given a v1-encrypted key is re-encrypted during unlock, when Supabase update fails, then the unlock still succeeds (user is not blocked) and re-encryption is retried on next unlock.

**Rollback Flag:**

- [ ] AC-6c: Given `ENCRYPTION_V2_ENABLED=false`, when `encryptPrivateKey()` is called, then it produces v1 (PBKDF2) format output. When `decryptPrivateKey()` is called on v2 data, it still decrypts successfully.

**Argon2 Graceful Degradation:**

- [ ] AC-6d: Given the `argon2` native module is unavailable, when `encryptPrivateKey()` is called, then it throws an error with message "Argon2id unavailable" and does NOT fall back to PBKDF2 for new encryptions.
- [ ] AC-6e: Given the `argon2` native module is unavailable, when `decryptPrivateKey()` is called on a v1-formatted key, then it decrypts successfully using PBKDF2.
- [ ] AC-6f: Given the `argon2` native module is unavailable, when `decryptPrivateKey()` is called on a v2-formatted key, then it still decrypts successfully using a PBKDF2 degraded fallback and logs a warning.

**Session Security:**

- [ ] AC-7: Given a session is created, when the Supabase insert is inspected, then the `session_token` column contains a SHA-256 hash (64 hex chars), not the raw token.
- [ ] AC-8: Given a session is created, when `revokeSession()` is called, then the Supabase update uses the hashed token to match the `session_token` column.
- [ ] AC-8b: Given `createSession()` is called and the Supabase insert fails, when `validateSession()` is called with the token, then it still returns valid (session exists in-memory Map). The session will be cleaned up by the existing expiry timer.

**Rate Limiting:**

- [ ] AC-9: Given a wallet ID, when `verifyPassword()` is called 5 times with wrong passwords, then the 6th call throws a rate-limit error without attempting decryption.
- [ ] AC-10: Given a wallet is rate-limited, when 15 minutes have elapsed, then the next `verifyPassword()` call is allowed.
- [ ] AC-11: Given a wallet has 4 failed attempts, when a correct password is provided, then the rate limit counter resets to 0.
- [ ] AC-11b: Given a wallet ID, when `retrievePrivateKey()` is called 5 times with wrong passwords, then the 6th call throws a rate-limit error without attempting decryption (same behavior as `verifyPassword`).
- [ ] AC-12: Given the rate limiter Map is inspected at any point, then it contains ONLY `{ attempts: number, lockedUntil: Date | null }` per walletId — NO passwords, keys, encrypted data, or any key material.

**Key Zeroization:**

- [ ] AC-13: Given `withDecryptedKey()` is called with a valid encrypted key, when the callback completes successfully, then the internal Buffer is zeroed (`buffer.every(b => b === 0)` is true).
- [ ] AC-14: Given `withDecryptedKey()` is called and the callback throws an error, when the error propagates, then the internal Buffer is still zeroed (finally block executed).

**encryptData/decryptData Async Migration:**

- [ ] AC-14b: Given `encryptData()` is called, when encryption completes, then the output uses Argon2id (v2 format) and the function is async.
- [ ] AC-14c: Given `decryptData()` is called on v1-formatted data, when decryption completes, then it succeeds using PBKDF2 fallback (backward compatible).
- [ ] AC-14d: Given all consumers of `encryptData`/`decryptData` across the codebase, when inspected, then every call site uses `await`.

**Unification:**

- [ ] AC-15: Given `stellar-sdk/src/utils/encryption.utils.ts` is inspected, then it only contains re-exports from `invisible-wallet` — no duplicated implementation code.
- [ ] AC-16: Given any stellar-sdk module calls `decryptPrivateKey()` or `withDecryptedKey()`, when the import is traced, then it resolves to `invisible-wallet/src/utils/encryption.utils.ts`.

**Performance:**

- [ ] AC-18b: Given Argon2id `encryptPrivateKey()` or `decryptPrivateKey()` is called on the target deployment environment, when execution time is measured, then it completes within 500ms. If it exceeds 500ms, reduce `ARGON2_MEMORY_COST` or `ARGON2_TIME_COST` until it meets the threshold while maintaining at least 32MB memory-cost.

**No Leakage:**

- [ ] AC-17: Given all modified files are searched for `console.log|console.error|console.warn`, then none log private keys, passwords, decrypted data, or encrypted key material.
- [ ] AC-18: Given all error messages thrown by encryption/key-management functions, then none contain actual key material, passwords, or internal crypto state.

## Additional Context

### Dependencies

- `argon2@^0.44.0` npm package (already installed in invisible-wallet)
- Node.js `crypto` module (built-in)
- `@stellar/stellar-sdk@^14.5.0` (Keypair generation)
- `jest@^30.2.0` / `ts-jest@^29.4.6` (testing) — **Note**: `ts-jest@^29.x` targets Jest 29. The project currently uses this combination (root `package.json`). If test setup fails, upgrade to `ts-jest@^30.x` or verify compatibility before implementation.

### Testing Strategy

**Unit Tests (new):**
- `packages/core/invisible-wallet/src/test/key-management.test.ts` — Tests for session Map fix, changePassword table fix, rate limiting, session token hashing. Mock Supabase client.
- Update `packages/core/stellar-sdk/src/test/encryption.test.ts` — All tests become async. Add v1/v2 format tests, backward compat tests, CSPRNG password tests, withDecryptedKey zeroization tests.

**Integration Tests (verify existing pass):**
- `packages/core/invisible-wallet/src/test/invisible.test.ts` — Verify wallet creation, unlock, and payment flows still work with async encryption.
- `packages/core/invisible-wallet/src/backup/test/encryption.test.ts` — Verify backup encryption (Argon2Provider, PBKDF2Provider) still passes.

**Manual Testing:**
- Create a wallet, verify encrypted key in Supabase starts with `v2:`
- Unlock wallet, verify session token in Supabase is a 64-char hex hash
- Attempt 6 wrong passwords, verify lockout error on 6th attempt
- Wait 15 minutes (or mock time), verify unlock works again
- Import a v1-encrypted backup, verify decryption succeeds and re-encryption produces v2

**Performance Testing:**
- Benchmark Argon2id encrypt/decrypt — expect ~100-300ms per operation (vs ~50ms for PBKDF2). Acceptable for wallet operations.

### Notes

- Migration to Argon2id uses format versioning: v1 = PBKDF2, v2 = Argon2id. Decryption detects version automatically. Re-encryption from v1→v2 is triggered on `unlockWallet()` (best-effort, see Task 9 step 3). Password change and backup export also produce v2 format since `encryptPrivateKey` always uses v2.
- Zero-trust principle: private keys must never exist in memory longer than needed for a single operation.
- `changePassword()` bug at key-managment.service.ts:306-310 writes to wrong Supabase table — must be fixed to `invisible_wallets` with column `encrypted_private_key`.
- `stellar-service.ts:648` also uses `Math.random()` for wallet ID generation — same pattern as `invisible-wallet.service.ts:817`. Not a security issue for IDs but worth noting for future cleanup.
- 8 files consume `decryptPrivateKey` across the codebase — all updated to async + withDecryptedKey pattern.
- Argon2id encryption is async — all consumer methods must use `await`.

### Known Limitations

1. **String copy in `withDecryptedKey`** — `keyBuffer.toString('utf8')` creates an immutable string that cannot be zeroed. Accepted residual risk (see Technical Decisions).
2. **Concurrent unlock race condition** — If two unlock requests for the same v1-encrypted wallet arrive simultaneously, both may detect v1 and attempt re-encryption to v2 with different random salts. The last Supabase write wins. This is safe for unlock-only flows (both v2 ciphertexts are valid, the password is the same). **Risk with `changePassword`**: If a concurrent `changePassword()` interleaves between the v1 read and the v2 write of a re-encryption, the re-encryption could overwrite the new password's ciphertext with an old-password v2 ciphertext. Mitigation: `changePassword()` must read-then-write atomically (use Supabase `.update().match()` with a version check or compare-and-swap on `updated_at`). If the CAS fails, the change is retried. This interaction is low probability in practice (single-user wallets). Future: add per-wallet migration lock if observed.
3. **Multi-instance rate limiter** — The in-memory rate limiter is per-process. In a multi-instance deployment (e.g., multiple serverless containers), an attacker can distribute attempts across instances to bypass the limit. Mitigation: acceptable for current single-instance deployment. Future: migrate to Redis-backed rate limiter for distributed enforcement.
4. **Rate limiter lost on restart** — If the service restarts (crash, deployment, OOM), all rate-limit state is lost. An attacker who can trigger a crash gets an instant rate-limit reset. Mitigation: Argon2id's 64MB memory-cost makes brute-force infeasible even without rate-limiting (~3-10 attempts/sec vs millions for PBKDF2). The rate limiter is defense-in-depth, not the primary defense. Future: persist rate-limit state to Supabase or Redis if restart-triggered resets are observed in logs.

### High-Risk Items (from Pre-mortem Analysis)

1. **Migration breaks existing keys** — Mitigated by v1 format detection and PBKDF2 fallback. Test with real v1-encrypted data.
2. **Async migration breaks callers** — All callers identified and listed in Tasks 8-11. TypeScript compiler will catch any missed `await`.
3. **Re-export path resolution** — Test that `stellar-sdk` consumers correctly resolve imports through the re-export. Verify in Jest and at build time.
4. **Argon2 native module issues** — `argon2` requires native compilation. Verify it builds on CI (Linux/macOS). Fallback: the PBKDF2 path remains available for decryption.
5. **Rollback plan** — If critical issues are found after deployment:
   - **Safe rollback**: The v2 decryption code can be reverted because v2 keys include all Argon2 params in the ciphertext format. A rollback release must keep the v2 decryption path (read-only) but can disable v2 encryption (revert to PBKDF2 for new encryptions). This means: (a) existing v2-encrypted keys remain accessible, (b) new encryptions fall back to v1/PBKDF2, (c) no data loss.
   - **Implementation**: Add an `ENCRYPTION_V2_ENABLED` environment variable (default `true`). If set to `false`, `encryptPrivateKey` uses PBKDF2 (v1) while `decryptPrivateKey` still handles both v1 and v2. This allows instant rollback without code deployment — just flip the env var.
   - **Migration reversal**: NOT supported. Once a key is re-encrypted as v2, it stays v2. The rollback only affects NEW encryptions. This is acceptable because v2 is strictly stronger than v1.
