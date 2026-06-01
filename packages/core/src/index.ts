export {
  WalletStore,
  defaultWalletStore,
  type EncryptedPayload,
  type StoredWalletRecord,
  type WalletListEntry,
  type WalletStoreOptions,
} from './cli/wallet-store.js';

export {
  walletCommand,
  createWalletCommands,
  type WalletCommandDeps,
} from './cli/commands/wallet.js';
