import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DependencyInstaller } from '../tools/cli/src/utils/dependency-installer.js';
import { ProjectScaffolder } from '../tools/cli/src/utils/project-scaffolder.js';
import { TemplateLoader } from '../tools/cli/src/utils/template-loader.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function smokeTestBasicTemplate(): Promise<void> {
  const templateDirectory = path.join(repositoryRoot, 'packages/templates');
  const previousTemplatesDirectory = process.env.TEMPLATES_DIR;
  let temporaryDirectory: string | undefined;

  try {
    process.env.TEMPLATES_DIR = templateDirectory;
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'galaxy-template-basic-'));
    const projectDirectory = path.join(temporaryDirectory, 'my-app');
    const templateConfig = await new TemplateLoader(templateDirectory).loadTemplate('basic');
    const scaffoldResult = await new ProjectScaffolder().scaffoldProject({
      name: 'my-app',
      template: 'basic',
      directory: projectDirectory,
    });

    if (!scaffoldResult.success) {
      throw new Error(`Template scaffolding failed: ${scaffoldResult.errors?.join('; ')}`);
    }

    const installed = await new DependencyInstaller().installDependencies(
      projectDirectory,
      templateConfig,
    );
    if (!installed) {
      throw new Error('Template dependencies failed to install.');
    }

    await run('npm', ['run', 'type-check'], projectDirectory);
    console.log('Basic template scaffold, install, and TypeScript check passed.');
  } finally {
    if (previousTemplatesDirectory === undefined) {
      delete process.env.TEMPLATES_DIR;
    } else {
      process.env.TEMPLATES_DIR = previousTemplatesDirectory;
    }

    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

smokeTestBasicTemplate().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
