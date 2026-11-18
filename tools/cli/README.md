# Galaxy CLI - Create Command

The Galaxy CLI provides a powerful `create` command for scaffolding new Stellar DApp projects from predefined templates.

## Overview

The `create` command allows developers to quickly bootstrap new projects with:
- Pre-configured project structure
- Template-based file generation
- Automatic dependency installation
- Variable substitution for project-specific customization

## Usage

```bash
galaxy create <project-name> [options]
```

### Arguments

- `<project-name>` - Name of the project to create (required if not prompted)

### Options

- `-t, --template <template>` - Template to use (default: "basic")
- `-d, --directory <directory>` - Directory to create project in (default: current directory + project name)
- `--skip-install` - Skip automatic dependency installation

### Examples

```bash
# Create a basic Stellar DApp
galaxy create my-stellar-app

# Create a project with specific template
galaxy create my-defi-app --template defi

# Create in specific directory
galaxy create my-app --directory ./projects

# Skip dependency installation
galaxy create my-app --skip-install
```

## Available Templates

### Basic Template (`basic`)
A complete Next.js-based Stellar DApp with:
- Next.js 15 with TypeScript
- React 19
- Tailwind CSS for styling
- Framer Motion for animations
- Zustand for state management
- Axios for HTTP requests
- ESLint and Prettier configuration
- Jest for testing

**Features:**
- Stellar wallet connection
- Basic UI components
- Responsive design
- Development server setup

## Project Structure

After creation, your project will have:

```
my-project/
├── src/
│   ├── pages/
│   │   ├── index.tsx
│   │   ├── _app.tsx
│   │   └── ...
│   ├── styles/
│   │   └── globals.css
│   └── ...
├── contracts/
├── supabase/
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── jest.config.cjs
└── README.md
```

## Configuration

### Template Configuration

Templates are defined in JSON files located in `packages/templates/<template-name>/template.json`:

```json
{
  "name": "basic",
  "description": "Basic Stellar DApp template",
  "version": "1.0.0",
  "author": "Galaxy DevKit Team",
  "dependencies": ["next@^15.3.1", "react@^19.0.0"],
  "devDependencies": ["@types/node@^20.0.0"],
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  },
  "files": [
    {
      "path": "README.md",
      "content": "# {{PROJECT_NAME}}\n\nProject description..."
    }
  ]
}
```

### Variable Substitution

Templates support variable substitution using `{{VARIABLE_NAME}}` syntax:

- `{{PROJECT_NAME}}` - Project name
- `{{PROJECT_NAME_LOWER}}` - Project name in lowercase
- `{{PROJECT_NAME_UPPER}}` - Project name in uppercase
- `{{AUTHOR}}` - Template author
- `{{VERSION}}` - Template version
- `{{DESCRIPTION}}` - Template description

## Development

### Building the CLI

```bash
cd tools/cli
npm install
npm run build
```

### Testing

```bash
# Test the create command
node dist/index.js create test-project --skip-install

# Clean up test projects
rm -rf test-project
```

## Architecture

The create command consists of several key components:

### Core Modules

- **`template-loader.ts`** - Loads and validates template configurations
- **`project-scaffolder.ts`** - Handles project file generation and variable substitution
- **`dependency-installer.ts`** - Manages dependency installation across package managers
- **`create.ts`** - Main command implementation

### Type Definitions

- **`template-types.ts`** - TypeScript interfaces for templates and scaffolding

### Template System

Templates are stored in `packages/templates/` with each template in its own directory containing:
- `template.json` - Template configuration
- Project files and directories to copy

## Error Handling

The CLI provides comprehensive error handling for:
- Invalid template names
- Missing template files
- Directory conflicts
- Dependency installation failures
- File system errors

## Contributing

To add a new template:

1. Create a new directory in `packages/templates/`
2. Add a `template.json` configuration file
3. Add template files and directories
4. Update this documentation

## Troubleshooting

### Common Issues

**Template not found**
- Ensure the template directory exists in `packages/templates/`
- Check that `template.json` is present and valid

**Dependencies fail to install**
- Check internet connection
- Verify package manager is available (npm/yarn/pnpm)
- Use `--skip-install` and install manually

**Permission errors**
- Ensure write permissions in target directory
- Check if directory already exists

### Debug Mode

For debugging, you can run the CLI with verbose output by checking the console logs during execution.

## License

MIT License - Galaxy DevKit Team
## Contract deployment

### `galaxy deploy contract <name>`

Builds `contracts/<name>/Cargo.toml` with `stellar contract build`, uploads the
WASM, and creates a contract through Stellar RPC. Requires Stellar CLI, Rust with
the WASM target, and a funded account in the `STELLAR_SECRET_KEY` environment
variable. Keep the secret in your local environment or CI secret store.

```bash
galaxy deploy contract hello --network testnet
galaxy deploy contract hello --network testnet --json
```

`--network` accepts `testnet` (default), `futurenet`, or `mainnet`. Shared network
configuration honors `STELLAR_RPC_URL` and `STELLAR_NETWORK_PASSPHRASE`. The command
prints the real contract ID and transaction hash only after ledger confirmation,
and appends them to `.galaxy/deployments.json`. Failed or timed-out transactions
exit nonzero. If confirmation times out, check the reported hash before retrying.

One contract WASM must be produced by the manifest. Contracts requiring constructor
arguments are not supported by this command yet. Fees are estimated by RPC during
transaction preparation; `--gas-limit` is no longer accepted.

The simulated `--verify` flag has been removed. Application/API hosting, database
setup, and Vercel/Netlify deployment are out of scope; use the hosting provider's
own CLI. Bare `galaxy deploy` displays command help. Legacy `--env`, `--contract`,
`--contracts`, `--api`, and `--platform` options are not supported.

### Deployment integration test

Install Stellar CLI, Rust, and the `wasm32v1-none` target. Then run from the
repository root (PowerShell: set `$env:GALAXY_DEPLOY_INTEGRATION = '1'` first):

```bash
GALAXY_DEPLOY_INTEGRATION=1 npm run test:integration -- --runInBand --runTestsByPath packages/integration-tests/src/deploy.test.ts
```

This test builds the minimal Rust fixture, funds an ephemeral testnet account,
executes the actual CLI, confirms the transaction via RPC, and resolves its
interface with `stellar contract info interface`. It is skipped by default and
never uses an existing account's signing key.
