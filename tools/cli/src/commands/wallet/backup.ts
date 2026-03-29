import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const BACKUP_DIR = 'backups';

async function getWalletsPath() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.galaxy', 'wallets');
}

async function getBackupsPath() {
    const homeDir = os.homedir();
    const dir = path.join(homeDir, '.galaxy', BACKUP_DIR);
    await fs.ensureDir(dir);
    return dir;
}

function encrypt(text: string, password: string) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        content: encrypted
    };
}

function decrypt(encryptedData: any, password: string) {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const key = crypto.scryptSync(password, salt, 32);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

export const backupCommand = new Command('backup')
    .description('Backup/restore commands');

backupCommand.command('create')
    .description('Create encrypted backup of all wallets')
    .action(async () => {
        const spinner = ora('Preparing backup...').start();

        try {
            const walletsDir = await getWalletsPath();
            if (!await fs.pathExists(walletsDir)) {
                spinner.fail('No wallets found to backup.');
                return;
            }

            const files = await fs.readdir(walletsDir);
            const wallets: any = {};

            for (const file of files) {
                if (file.endsWith('.json')) {
                    wallets[file] = await fs.readJson(path.join(walletsDir, file));
                }
            }

            if (Object.keys(wallets).length === 0) {
                spinner.fail('No wallet files found.');
                return;
            }

            spinner.stop();

            const { password } = await inquirer.prompt([
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter password to encrypt backup:',
                    mask: '*'
                }
            ]);

            if (!password) {
                console.error(chalk.red('Password is required.'));
                return;
            }

            spinner.start('Encrypting backup...');

            const backupData = encrypt(JSON.stringify(wallets), password);

            const backupsDir = await getBackupsPath();
            const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            const backupPath = path.join(backupsDir, filename);

            await fs.writeJson(backupPath, backupData);

            spinner.succeed(chalk.green('Backup created successfully!'));
            console.log(chalk.gray(`Location: ${backupPath}`));

        } catch (error) {
            spinner.fail(chalk.red('Backup failed'));
            if (error instanceof Error) console.error(chalk.red(error.message));
        }
    });

export const restoreCommand = new Command('restore')
    .description('Restore wallet from backup')
    .argument('<backup-file>', 'Backup file path')
    .action(async (backupFile: string) => {
        const spinner = ora('Reading backup...').start();

        try {
            if (!await fs.pathExists(backupFile)) {
                spinner.fail('Backup file not found.');
                return;
            }

            const backupData = await fs.readJson(backupFile);

            spinner.stop();

            const { password } = await inquirer.prompt([
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter password to decrypt backup:',
                    mask: '*'
                }
            ]);

            spinner.start('Restoring...');

            let walletsStr;
            try {
                walletsStr = decrypt(backupData, password);
            } catch (e) {
                spinner.fail('Decryption failed. Incorrect password?');
                return;
            }

            const wallets = JSON.parse(walletsStr);
            const walletsDir = await getWalletsPath();
            await fs.ensureDir(walletsDir);

            let restoredCount = 0;
            for (const [filename, content] of Object.entries(wallets)) {
                await fs.writeJson(path.join(walletsDir, filename), content, { spaces: 2 });
                restoredCount++;
            }

            spinner.succeed(chalk.green(`Successfully restored ${restoredCount} wallets!`));

        } catch (error) {
            spinner.fail(chalk.red('Restore failed'));
            if (error instanceof Error) console.error(chalk.red(error.message));
        }
    });
