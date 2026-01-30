/**
 * @fileoverview Dev command for Galaxy CLI
 * @description Starts development mode with hot reload
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

const devCommand = new Command('dev');

devCommand
  .description('Start development mode with hot reload')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .option('--hot-reload', 'Enable hot reload')
  .option('--watch', 'Watch for file changes')
  .option('--debug', 'Enable debug mode')
  .action(async (options) => {
    try {
      console.log(chalk.blue('Starting Galaxy development mode...'));

      // Check if we're in a Galaxy project
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        console.error(chalk.red('Not in a Galaxy project directory'));
        console.error(chalk.yellow('Run this command from your Galaxy project root'));
        process.exit(1);
      }

      const packageJson = await fs.readJson(packageJsonPath);
      if (!packageJson.name?.includes('galaxy') && !packageJson.dependencies?.['@galaxy-kj/']) {
        console.error(chalk.red('Not a Galaxy project'));
        console.error(chalk.yellow('This command must be run from a Galaxy project'));
        process.exit(1);
      }

      // Start development mode
      await startDevelopmentMode(options);

      console.log(chalk.green('\n✅ Development mode started successfully!'));

    } catch (error) {
      console.error(chalk.red('Error starting development mode:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Starts development mode
 * @param options - Development options
 */
async function startDevelopmentMode(options: any): Promise<void> {
  const spinner = ora('Starting development mode...').start();
  
  try {
    // Check if this is a Next.js project
    const nextConfigPath = path.join(process.cwd(), 'next.config.js');
    
    if (!await fs.pathExists(nextConfigPath)) {
      console.log(chalk.yellow('No Next.js project found, starting basic development server'));
      await startBasicDevServer(options);
      return;
    }

    // Start Next.js development server
    await startNextDevServer(options);
    spinner.succeed('Development mode started');

  } catch (error) {
    spinner.fail('Failed to start development mode');
    throw error;
  }
}

/**
 * Starts Next.js development server
 * @param options - Development options
 */
async function startNextDevServer(options: any): Promise<void> {
  const spinner = ora('Starting Next.js development server...').start();
  
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    
    if (!packageJson.scripts?.dev) {
      console.log(chalk.yellow('No dev script found in package.json'));
      return;
    }

    // Start Next.js dev server
    await execa('npm', ['run', 'dev'], { 
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    spinner.succeed('Next.js development server started');

  } catch (error) {
    spinner.fail('Failed to start Next.js development server');
    throw error;
  }
}

/**
 * Starts basic development server
 * @param options - Development options
 */
async function startBasicDevServer(options: any): Promise<void> {
  const spinner = ora('Starting basic development server...').start();
  
  try {
    // Check if there's a basic server setup
    const serverPath = path.join(process.cwd(), 'server.js');
    const serverIndexPath = path.join(process.cwd(), 'index.js');
    
    if (!await fs.pathExists(serverPath) && !await fs.pathExists(serverIndexPath)) {
      console.log(chalk.yellow('No server file found, creating basic development server'));
      await createBasicDevServer(options);
    }

    // Start basic server
    const serverFile = await fs.pathExists(serverPath) ? serverPath : serverIndexPath;
    await execa('node', [serverFile], { 
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    spinner.succeed('Basic development server started');

  } catch (error) {
    spinner.fail('Failed to start basic development server');
    throw error;
  }
}

/**
 * Creates basic development server
 * @param options - Development options
 */
async function createBasicDevServer(options: any): Promise<void> {
  const serverContent = `const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || ${options.port};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(\`Development server running on port \${PORT}\`);
  console.log(\`Open http://localhost:\${PORT} in your browser\`);
});
`;

  await fs.writeFile(path.join(process.cwd(), 'server.js'), serverContent);

  // Create basic HTML file
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Galaxy Development Server</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 10px;
            text-align: center;
        }
        h1 {
            margin-bottom: 20px;
        }
        .status {
            background: rgba(0, 255, 0, 0.2);
            padding: 10px;
            border-radius: 5px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Galaxy Development Server</h1>
        <p>Your Galaxy project is running in development mode!</p>
        <div class="status">
            <strong>Status:</strong> Development server is running
        </div>
        <p>Start building your Stellar DApp with Galaxy DevKit!</p>
    </div>
</body>
</html>`;

  await fs.ensureDir(path.join(process.cwd(), 'public'));
  await fs.writeFile(path.join(process.cwd(), 'public', 'index.html'), htmlContent);
}

export { devCommand };

