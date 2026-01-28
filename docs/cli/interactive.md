# Galaxy CLI Interactive Mode

The Galaxy CLI features an interactive REPL (Read-Eval-Print-Loop) mode that provides a user-friendly interface with autocomplete, command history, and guided workflows.

## Getting Started

### Launch Interactive Mode

```bash
# Launch interactive mode (default when no arguments)
galaxy

# Or explicitly
galaxy interactive
```

### Example Session

```console
$ galaxy

🌌 Galaxy DevKit Interactive Mode
Type 'help' for commands or 'exit' to quit

galaxy> wallet create
? Wallet name: dev-wallet
✓ Wallet created: GABC...XYZ

galaxy> oracle price XLM/USD
XLM/USD: $0.1234 (5/5 sources)

galaxy> exit
Goodbye! 👋
```

## Features

### Tab Completion

Press `Tab` to autocomplete commands, subcommands, and options:

```console
galaxy> wal<Tab>
galaxy> wallet

galaxy> wallet <Tab>
create    import    list    multisig    ledger    biometric    recovery    backup    restore

galaxy> wallet create --<Tab>
--name    --network
```

### Command History

Navigate through your command history using arrow keys:

| Key                | Action           |
| ------------------ | ---------------- |
| `↑` (Up Arrow)     | Previous command |
| `↓` (Down Arrow)   | Next command     |
| `Ctrl+R`           | Search history   |

View and manage history with the `history` command:

```console
galaxy> history
   1  wallet create
   2  oracle price XLM/USD
   3  wallet list

galaxy> history -n 5    # Show last 5 commands
galaxy> history --clear  # Clear history
```

History is automatically saved to `~/.galaxy/history` (last 100 commands).

### Session State

The REPL maintains session state including:

- **Network**: Current Stellar network (testnet, mainnet, futurenet, standalone)
- **Active Wallet**: Currently selected wallet for operations
- **Variables**: Custom key-value pairs for scripting

```console
galaxy> session
Network: testnet
Wallet: dev-wallet
Working Directory: /Users/me/project
Session Duration: 5m 32s
Commands Executed: 12
Variables:
  DEFAULT_AMOUNT=100
```

#### Managing Session

```console
# Switch network
galaxy> network mainnet
✓ Switched to mainnet

# Show current network
galaxy> network
Current network: mainnet

# Set session variable
galaxy> set MY_VAR value
✓ Set MY_VAR=value

# Get variable
galaxy> env
MY_VAR=value

# Unset variable
galaxy> unset MY_VAR
✓ Unset MY_VAR

# Reset session
galaxy> session --reset
Session reset to defaults.
```

### Keyboard Shortcuts

| Shortcut     | Action               |
| ------------ | -------------------- |
| `Tab`        | Autocomplete         |
| `↑` / `↓`    | Navigate history     |
| `Ctrl+R`     | Search history       |
| `Ctrl+C`     | Cancel current input |
| `Ctrl+D`     | Exit REPL            |
| `Ctrl+L`     | Clear screen         |

### Guided Workflows

For complex multi-step operations, use guided workflows:

```console
galaxy> workflow
Available Workflows:
  create-project - Set up a new Galaxy DevKit project
  setup-wallet   - Create or import a wallet
  deploy-contract - Deploy a Soroban smart contract

galaxy> workflow setup-wallet
Setup Wallet
Create or import a wallet for your project

? What would you like to do? Create New Wallet
? Enter a name for this wallet: my-wallet
? Which network? Testnet
? Create a backup of this wallet? Yes
? Choose backup format: Encrypted JSON
? Set as active wallet for this session? Yes

✓ Workflow completed successfully!
```

## Built-in Commands

### General

| Command            | Description              |
| ------------------ | ------------------------ |
| `help [command]`   | Show help information    |
| `exit`, `quit`     | Exit interactive mode    |
| `clear`            | Clear the screen         |
| `history [-n N]`   | Show command history     |
| `session [--reset]`| Show/reset session state |

### Session Management

| Command              | Description              |
| -------------------- | ------------------------ |
| `network [name]`     | Show/switch network      |
| `env`                | Show session variables   |
| `set <key> <value>`  | Set session variable     |
| `unset <key>`        | Remove session variable  |

### Workflows

| Command            | Description              |
| ------------------ | ------------------------ |
| `workflow`         | List available workflows |
| `workflow <name>`  | Run a guided workflow    |

## Galaxy Commands

All standard Galaxy CLI commands work in interactive mode:

```console
galaxy> create my-project --template defi
galaxy> wallet create --name dev-wallet
galaxy> oracle price XLM/USD --json
galaxy> build --watch
galaxy> deploy --env staging
```

## Options

### Disable History

```bash
galaxy interactive --no-history
```

### Disable Session Persistence

```bash
galaxy interactive --no-session
```

## Configuration

### History File

Location: `~/.galaxy/history`

- Stores last 100 commands
- Includes timestamps and success status
- Automatically deduplicated

### Session State

Location: `~/.galaxy/session.json`

Persisted state includes:
- Selected network
- Active wallet
- Custom variables

## API Reference

The interactive module exports utilities for programmatic use:

```typescript
import {
  GalaxyRepl,
  startRepl,
  createRepl,
  SessionManager,
  HistoryManager,
  AutocompleteManager,
  WorkflowManager,
} from '@galaxy/cli/commands/interactive';

// Create and start REPL
const repl = await startRepl(async (command) => {
  // Custom command executor
  console.log(`Executing: ${command}`);
});

// Or create without starting
const repl = createRepl({
  prompt: 'custom> ',
  welcomeMessage: 'Welcome!',
});

repl.setCommandExecutor(executor);
await repl.start();
```

### SessionManager

```typescript
const session = getSessionManager();

// Network
await session.setNetwork('mainnet');
const network = session.getNetwork();

// Wallet
await session.setActiveWallet('GABCDEF...', 'my-wallet');
const wallet = session.getActiveWallet();

// Variables
await session.setVariable('KEY', 'value');
const value = session.getVariable('KEY');

// Events
session.on('network-change', ({ oldNetwork, newNetwork }) => {
  console.log(`Network changed from ${oldNetwork} to ${newNetwork}`);
});
```

### HistoryManager

```typescript
const history = getHistoryManager();

// Add commands
await history.add('wallet create', true, 150); // success, duration

// Navigation
const previous = history.previous();
const next = history.next();

// Search
const results = history.search('wallet');
const byPrefix = history.getByPrefix('ora');

// Persistence
await history.save();
await history.load();
```

### AutocompleteManager

```typescript
const autocomplete = getAutocompleteManager();

// Get suggestions
const suggestions = autocomplete.getSuggestions('wallet cr');

// Get help
const help = autocomplete.getHelp('wallet create');

// Register custom command
autocomplete.registerCommand({
  name: 'custom',
  description: 'Custom command',
  options: [
    { long: '--verbose', description: 'Verbose', requiresValue: false }
  ]
});
```

### WorkflowManager

```typescript
const workflows = getWorkflowManager();

// List workflows
const list = workflows.list();

// Run workflow
await workflows.run('setup-wallet');

// Register custom workflow
workflows.register({
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'Custom workflow',
  steps: [
    {
      id: 'name',
      title: 'Enter name:',
      type: 'input',
      validate: (v) => v.length > 0 || 'Required'
    }
  ],
  execute: async (answers) => {
    console.log(`Name: ${answers.name}`);
  }
});
```

## Troubleshooting

### History Not Saving

Ensure `~/.galaxy` directory is writable:

```bash
mkdir -p ~/.galaxy
chmod 755 ~/.galaxy
```

### Autocomplete Not Working

Tab completion requires a terminal that supports readline. Some terminal emulators may need configuration.

### Session Not Persisting

Check that `--no-session` flag is not being used and that `~/.galaxy/session.json` is writable.

## Related Documentation

- [CLI Overview](../README.md)
- [Wallet Commands](./wallet.md)
- [Oracle Commands](./oracle.md)
- [Configuration](./config.md)
