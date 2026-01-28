import { Command } from 'commander';
import { createWalletCommand } from './create.js';
import { importWalletCommand } from './import.js';
import { listWalletsCommand } from './list.js';
import { multisigCommand } from './multisig.js';
import { ledgerCommand } from './ledger.js';
import { biometricCommand } from './biometric.js';
import { recoveryCommand } from './recovery.js';
import { backupCommand, restoreCommand } from './backup.js';

export const walletCommand = new Command('wallet')
    .description('Wallet management commands');

walletCommand.addCommand(createWalletCommand);
walletCommand.addCommand(importWalletCommand);
walletCommand.addCommand(listWalletsCommand);
walletCommand.addCommand(multisigCommand);
walletCommand.addCommand(ledgerCommand);
walletCommand.addCommand(biometricCommand);
walletCommand.addCommand(recoveryCommand);
walletCommand.addCommand(backupCommand);
walletCommand.addCommand(restoreCommand);
