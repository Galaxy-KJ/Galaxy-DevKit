# Protocol Commands

The `galaxy protocol` command group provides CLI access to interact with DeFi protocols on Stellar, including Blend (lending) and Soroswap (DEX).

## Overview

```bash
galaxy protocol <command> [options]
```

## Commands

### List Protocols

List all available DeFi protocols.

```bash
galaxy protocol list [--network testnet|mainnet] [--json]
```

**Options:**
- `--network <network>` - Filter by network (testnet or mainnet)
- `--json` - Output as JSON

**Example:**
```bash
# List all protocols
galaxy protocol list

# List protocols available on testnet
galaxy protocol list --network testnet

# Output as JSON
galaxy protocol list --json
```

### Protocol Info

Show detailed information about a specific protocol.

```bash
galaxy protocol info <protocol-name> [--network testnet|mainnet] [--json]
```

**Arguments:**
- `<protocol-name>` - Protocol name (e.g., `blend`, `soroswap`)

**Options:**
- `--network <network>` - Network (default: testnet)
- `--json` - Output as JSON

**Example:**
```bash
# Get Blend Protocol info
galaxy protocol info blend

# Get Soroswap info on mainnet
galaxy protocol info soroswap --network mainnet

# Output as JSON
galaxy protocol info blend --json
```

### Connect to Protocol

Test connection to a DeFi protocol.

```bash
galaxy protocol connect <protocol-name> [--network testnet|mainnet] [--json]
```

**Example:**
```bash
# Test Blend connection
galaxy protocol connect blend

# Test Soroswap connection on mainnet
galaxy protocol connect soroswap --network mainnet
```

---

## Blend Protocol Commands

Interact with Blend Protocol for lending and borrowing operations.

### Supply Assets

Supply assets to Blend Protocol to earn interest.

```bash
galaxy protocol blend supply <asset> <amount> [options]
```

**Arguments:**
- `<asset>` - Asset code (e.g., USDC, XLM)
- `<amount>` - Amount to supply

**Options:**
- `-w, --wallet <name>` - Wallet name to use
- `--network <network>` - Network (default: testnet)
- `--json` - Output as JSON
- `-y, --yes` - Skip confirmation prompt

**Example:**
```bash
# Supply 100 USDC
galaxy protocol blend supply USDC 100

# Supply using specific wallet
galaxy protocol blend supply XLM 1000 --wallet my-wallet

# Skip confirmation
galaxy protocol blend supply USDC 100 --yes
```

### Withdraw Assets

Withdraw supplied assets from Blend Protocol.

```bash
galaxy protocol blend withdraw <asset> <amount> [options]
```

**Example:**
```bash
# Withdraw 50 USDC
galaxy protocol blend withdraw USDC 50

# Withdraw all XLM
galaxy protocol blend withdraw XLM 1000 --wallet my-wallet
```

### Borrow Assets

Borrow assets from Blend Protocol using supplied collateral.

```bash
galaxy protocol blend borrow <asset> <amount> [options]
```

**Example:**
```bash
# Borrow 500 USDC
galaxy protocol blend borrow USDC 500

# Borrow with specific wallet
galaxy protocol blend borrow XLM 100 --wallet my-wallet
```

### Repay Borrowed Assets

Repay borrowed assets to Blend Protocol.

```bash
galaxy protocol blend repay <asset> <amount> [options]
```

**Example:**
```bash
# Repay 250 USDC
galaxy protocol blend repay USDC 250

# Repay full amount
galaxy protocol blend repay XLM 100 --yes
```

### View Position

View your current lending/borrowing position.

```bash
galaxy protocol blend position [options]
```

**Options:**
- `-w, --wallet <name>` - Wallet name to use
- `--network <network>` - Network (default: testnet)
- `--json` - Output as JSON

**Example:**
```bash
# View position
galaxy protocol blend position

# View position for specific wallet
galaxy protocol blend position --wallet my-wallet

# Output as JSON
galaxy protocol blend position --json
```

---

## Swap Commands

Execute token swaps on Soroswap DEX.

### Get Swap Quote

Get a quote for a token swap without executing.

```bash
galaxy protocol swap quote <from> <to> <amount> [options]
```

**Arguments:**
- `<from>` - Input token (e.g., XLM)
- `<to>` - Output token (e.g., USDC)
- `<amount>` - Amount of input token

**Options:**
- `--network <network>` - Network (default: testnet)
- `--json` - Output as JSON

**Example:**
```bash
# Get quote for swapping 100 XLM to USDC
galaxy protocol swap quote XLM USDC 100

# Get quote on mainnet
galaxy protocol swap quote XLM USDC 100 --network mainnet

# Output as JSON
galaxy protocol swap quote XLM USDC 100 --json
```

### Execute Swap

Execute a token swap.

```bash
galaxy protocol swap execute <from> <to> <amount> [options]
```

**Options:**
- `--slippage <percent>` - Slippage tolerance percentage (default: 1)
- `-w, --wallet <name>` - Wallet name to use
- `--network <network>` - Network (default: testnet)
- `--json` - Output as JSON
- `-y, --yes` - Skip confirmation prompt

**Example:**
```bash
# Swap 100 XLM to USDC with default 1% slippage
galaxy protocol swap execute XLM USDC 100

# Swap with 2% slippage tolerance
galaxy protocol swap execute XLM USDC 100 --slippage 2

# Swap using specific wallet
galaxy protocol swap execute XLM USDC 100 --wallet my-wallet

# Skip confirmation
galaxy protocol swap execute XLM USDC 100 --yes
```

---

## Liquidity Commands

Manage liquidity pools on Soroswap.

### Add Liquidity

Add liquidity to a pool.

```bash
galaxy protocol liquidity add <tokenA> <tokenB> <amountA> <amountB> [options]
```

**Arguments:**
- `<tokenA>` - First token (e.g., XLM)
- `<tokenB>` - Second token (e.g., USDC)
- `<amountA>` - Amount of first token
- `<amountB>` - Amount of second token

**Options:**
- `-w, --wallet <name>` - Wallet name to use
- `--network <network>` - Network (default: testnet)
- `--json` - Output as JSON
- `-y, --yes` - Skip confirmation prompt

**Example:**
```bash
# Add liquidity to XLM/USDC pool
galaxy protocol liquidity add XLM USDC 100 12

# Add liquidity using specific wallet
galaxy protocol liquidity add XLM USDC 100 12 --wallet my-wallet
```

### Remove Liquidity

Remove liquidity from a pool.

```bash
galaxy protocol liquidity remove <pool> <amount> [options]
```

**Arguments:**
- `<pool>` - Pool address or pair (e.g., XLM-USDC)
- `<amount>` - Amount of LP tokens to remove

**Example:**
```bash
# Remove liquidity
galaxy protocol liquidity remove XLM-USDC 50

# Remove with specific wallet
galaxy protocol liquidity remove POOL_ADDRESS 100 --wallet my-wallet
```

### List Pools

List available liquidity pools.

```bash
galaxy protocol liquidity pools [--network testnet|mainnet] [--json]
```

**Example:**
```bash
# List all pools
galaxy protocol liquidity pools

# List pools on mainnet
galaxy protocol liquidity pools --network mainnet
```

### Pool Info

Get information about a specific liquidity pool.

```bash
galaxy protocol liquidity info <tokenA> <tokenB> [options]
```

**Example:**
```bash
# Get XLM/USDC pool info
galaxy protocol liquidity info XLM USDC

# Output as JSON
galaxy protocol liquidity info XLM USDC --json
```

---

## Common Options

All protocol commands support these common options:

| Option | Description |
|--------|-------------|
| `--network <network>` | Target network: `testnet` (default) or `mainnet` |
| `--json` | Output machine-readable JSON |
| `-w, --wallet <name>` | Wallet to use for signing transactions |
| `-y, --yes` | Skip confirmation prompts |

## Transaction Flow

For commands that execute transactions:

1. **Wallet Selection** - If no wallet specified, you'll be prompted to select one
2. **Transaction Preview** - Shows operation details, amounts, and estimated fees
3. **Confirmation** - Asks for confirmation (skip with `-y`)
4. **Execution** - Submits transaction to the network
5. **Result** - Displays transaction hash and link to Stellar Expert

## Error Handling

The CLI handles common error scenarios:

- **Protocol not available** - When a protocol isn't deployed on the target network
- **Insufficient balance** - When wallet doesn't have enough funds
- **Slippage exceeded** - When price moves beyond tolerance during swap
- **Transaction failed** - When the on-chain transaction fails

## Examples

### Complete Lending Workflow

```bash
# 1. Check available protocols
galaxy protocol list

# 2. Connect to Blend
galaxy protocol connect blend

# 3. Supply collateral
galaxy protocol blend supply USDC 1000 --wallet my-wallet

# 4. Check position
galaxy protocol blend position --wallet my-wallet

# 5. Borrow against collateral
galaxy protocol blend borrow XLM 500 --wallet my-wallet

# 6. Repay loan
galaxy protocol blend repay XLM 500 --wallet my-wallet

# 7. Withdraw collateral
galaxy protocol blend withdraw USDC 1000 --wallet my-wallet
```

### Complete Swap Workflow

```bash
# 1. Get quote
galaxy protocol swap quote XLM USDC 100

# 2. Execute swap with 2% slippage
galaxy protocol swap execute XLM USDC 100 --slippage 2 --wallet my-wallet
```

### Complete Liquidity Workflow

```bash
# 1. Check available pools
galaxy protocol liquidity pools

# 2. Get pool info
galaxy protocol liquidity info XLM USDC

# 3. Add liquidity
galaxy protocol liquidity add XLM USDC 100 12 --wallet my-wallet

# 4. Remove liquidity
galaxy protocol liquidity remove XLM-USDC 50 --wallet my-wallet
```
