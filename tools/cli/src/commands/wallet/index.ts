import { walletCommand as coreWalletCommand } from '@galaxy-kj/core';
import { infoWalletCommand } from './info.js';
import { fundWalletCommand } from './fund.js';
import { multisigCommand } from './multisig.js';
import { ledgerCommand } from './ledger.js';
import { biometricCommand } from './biometric.js';
import { recoveryCommand } from './recovery.js';
import { backupCommand, restoreCommand } from './backup.js';

/** Core wallet commands (create, import, list, balance, send) plus extended CLI features. */
export const walletCommand = coreWalletCommand;

walletCommand.addCommand(infoWalletCommand);
walletCommand.addCommand(fundWalletCommand);
walletCommand.addCommand(multisigCommand);
walletCommand.addCommand(ledgerCommand);
walletCommand.addCommand(biometricCommand);
walletCommand.addCommand(recoveryCommand);
walletCommand.addCommand(backupCommand);
walletCommand.addCommand(restoreCommand);
