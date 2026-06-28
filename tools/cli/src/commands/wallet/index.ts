import { Command } from 'commander';
import { createWalletCommand } from './create.js';
import { importWalletCommand } from './import.js';
import { listWalletsCommand } from './list.js';
import { infoWalletCommand } from './info.js';
import { fundWalletCommand } from './fund.js';
import { balanceCommand } from './balance.js';
import { encryptWalletCommand } from './encrypt.js';
import { multisigCommand } from './multisig.js';
import { ledgerCommand } from './ledger.js';
import { biometricCommand } from './biometric.js';
import { recoveryCommand } from './recovery.js';
import { backupCommand, restoreCommand } from './backup.js';

export const walletCommand = new Command('wallet')
    .description('Manage Stellar wallets');

walletCommand.addCommand(createWalletCommand);
walletCommand.addCommand(importWalletCommand);
walletCommand.addCommand(listWalletsCommand);
walletCommand.addCommand(infoWalletCommand);
walletCommand.addCommand(balanceCommand);
walletCommand.addCommand(encryptWalletCommand);
walletCommand.addCommand(fundWalletCommand);
walletCommand.addCommand(multisigCommand);
walletCommand.addCommand(ledgerCommand);
walletCommand.addCommand(biometricCommand);
walletCommand.addCommand(recoveryCommand);
walletCommand.addCommand(backupCommand);
walletCommand.addCommand(restoreCommand);
