# Galaxy Blend CLI Commands

Interact with Blend Protocol for lending, borrowing, and position management directly from the command line with support for both testnet and mainnet.

## Overview

The `galaxy blend` command group provides comprehensive tools to supply assets, borrow against collateral, manage positions, and liquidate unhealthy accounts on Blend Protocol.

```bash
galaxy blend <subcommand> [options]
```

## Subcommands

### `supply` - Supply Assets to Earn Interest

Deposit assets into Blend lending pools to earn interest.

```bash
galaxy blend supply [options]
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-w, --wallet <name>` | Wallet name to use | interactive prompt |
| `-a, --asset <code>` | Asset code (XLM, USDC, BLND, wBTC, wETH) | interactive prompt |
| `-i, --issuer <address>` | Asset issuer address (not needed for XLM) | - |
| `--amount <amount>` | Amount to supply | interactive prompt |
| `--mainnet` | Use mainnet instead of testnet | `testnet` |
| `--json` | Output machine-readable JSON | table |

**Examples:**
```bash
# Interactive mode
galaxy blend supply

# Supply 100 XLM on testnet
galaxy blend supply --wallet dev --asset XLM --amount 100

# Supply 500 USDC on mainnet
galaxy blend supply --wallet prod --asset USDC --amount 500 --mainnet

# JSON output for scripting
galaxy blend supply --wallet dev --asset XLM --amount 100 --json
```

**Output Example:**
```text
Transaction Details:
════════════════════════════════════════════════════════════
  Hash:    abc123...xyz789
  Status:  SUCCESS
  Ledger:  1234567
  Amount:  100 XLM
════════════════════════════════════════════════════════════

🔗 View on Stellar Expert:
https://stellar.expert/explorer/testnet/tx/abc123...

🔗 View on Blend UI:
https://testnet.blend.capital/
```

> **Note:** Amounts are automatically converted to the correct decimal precision for each asset (XLM: 7, USDC: 6, wBTC: 8, wETH: 18).

---

### `withdraw` - Withdraw Supplied Assets

Withdraw your supplied assets from Blend pools.

```bash
galaxy blend withdraw [options]
```

**Options:** Same as `supply` command

**Examples:**
```bash
# Interactive mode
galaxy blend withdraw

# Withdraw 50 XLM
galaxy blend withdraw --wallet dev --asset XLM --amount 50

# Withdraw USDC from mainnet
galaxy blend withdraw --wallet prod --asset USDC --amount 200 --mainnet
```

---

### `borrow` - Borrow Against Collateral

Take loans against your supplied collateral.

```bash
galaxy blend borrow [options]
```

**Options:** Same as `supply` command

**Examples:**
```bash
# Interactive mode
galaxy blend borrow

# Borrow 25 XLM
galaxy blend borrow --wallet dev --asset XLM --amount 25

# Borrow USDC on mainnet
galaxy blend borrow --wallet prod --asset USDC --amount 100 --mainnet
```

**Output Example:**
```text
Transaction Details:
════════════════════════════════════════════════════════════
  Hash:    def456...uvw012
  Status:  SUCCESS
  Ledger:  1234568
  Amount:  25 XLM

  ⚠️  Remember to manage your health factor!
════════════════════════════════════════════════════════════
```

> **Warning:** Always monitor your health factor after borrowing to avoid liquidation.

---

### `repay` - Repay Borrowed Assets

Repay your borrowed amounts to improve health factor.

```bash
galaxy blend repay [options]
```

**Options:** Same as `supply` command

**Examples:**
```bash
# Interactive mode
galaxy blend repay

# Repay 10 XLM loan
galaxy blend repay --wallet dev --asset XLM --amount 10

# Repay USDC loan on mainnet
galaxy blend repay --wallet prod --asset USDC --amount 50 --mainnet
```

**Output Example:**
```text
Transaction Details:
════════════════════════════════════════════════════════════
  Hash:    ghi789...rst345
  Status:  SUCCESS
  Ledger:  1234569
  Amount:  10 XLM

  ✅ Your health factor has improved!
════════════════════════════════════════════════════════════
```

---

### `position` - View Your Position

Check your current lending and borrowing position.

```bash
galaxy blend position [options]
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-w, --wallet <name>` | Wallet name | interactive prompt |
| `-a, --address <address>` | Address to check (alternative to wallet) | - |
| `--mainnet` | Use mainnet | `testnet` |
| `--json` | Output machine-readable JSON | table |

**Examples:**
```bash
# View position for your wallet
galaxy blend position --wallet dev

# View position for specific address
galaxy blend position --address GBORROWER...

# Check position on mainnet
galaxy blend position --wallet prod --mainnet

# JSON output
galaxy blend position --wallet dev --json
```

**Output Example:**
```text
📊 Blend Protocol Position
════════════════════════════════════════════════════════════════════════════════
Address: GUSER...

💰 Supplied Assets:
┌────────┬──────────┬──────────────┐
│ Asset  │ Amount   │ Value (USD)  │
├────────┼──────────┼──────────────┤
│ XLM    │ 100.00   │ $40.00       │
│ USDC   │ 500.00   │ $500.00      │
└────────┴──────────┴──────────────┘

🏦 Borrowed Assets:
┌────────┬──────────┬──────────────┐
│ Asset  │ Amount   │ Value (USD)  │
├────────┼──────────┼──────────────┤
│ XLM    │ 25.00    │ $10.00       │
└────────┴──────────┴──────────────┘

📈 Summary:
────────────────────────────────────────────────────────────────────────────────
  Total Collateral: $540.00
  Total Debt:       $10.00
  Health Factor:    54.0
════════════════════════════════════════════════════════════════════════════════
```

---

### `health` - Check Health Factor

Monitor your position's health to avoid liquidation.

```bash
galaxy blend health [options]
```

**Options:** Same as `position` command

**Examples:**
```bash
# Check health for your wallet
galaxy blend health --wallet dev

# Check health for specific address
galaxy blend health --address GBORROWER...

# Monitor health on mainnet
galaxy blend health --wallet prod --mainnet
```

**Output Example:**
```text
🏥 Health Factor
════════════════════════════════════════════════════════════
  Address: GUSER...
────────────────────────────────────────────────────────────
  Health Factor:        2.5
  Liquidation Threshold: 0.85
  Max LTV:              0.75
  Status:               ✅ Healthy
════════════════════════════════════════════════════════════

  ✅ Your position is healthy!
```

**Health Factor Guide:**

| Range | Status | Color | Action |
| --- | --- | --- | --- |
| > 1.5 | Healthy | 🟢 Green | Safe to borrow more |
| 1.2 - 1.5 | Caution | 🟡 Yellow | Monitor closely |
| 1.0 - 1.2 | At Risk | 🔴 Red | Add collateral or repay |
| < 1.0 | Liquidatable | 🔴 Red | Position can be liquidated |

---

### `liquidate` - Liquidate Unhealthy Positions

Liquidate positions with health factor < 1.0 for profit.

```bash
galaxy blend liquidate [options]
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-w, --wallet <name>` | Your liquidator wallet | **required** |
| `-t, --target <address>` | Address to liquidate | **required** |
| `--debt-asset <code>` | Debt asset to repay | `XLM` |
| `--debt-amount <amount>` | Amount of debt to repay | **required** |
| `--collateral-asset <code>` | Collateral asset to receive | `XLM` |
| `--mainnet` | Use mainnet | `testnet` |
| `--yes` | Skip confirmation prompt | confirmation required |
| `--json` | Output machine-readable JSON | table |

**Examples:**
```bash
# Liquidate a position
galaxy blend liquidate \
  --wallet liquidator \
  --target GBORROWER... \
  --debt-asset XLM \
  --debt-amount 10 \
  --collateral-asset USDC

# Liquidate on mainnet without confirmation
galaxy blend liquidate \
  --wallet liquidator-prod \
  --target GBORROWER... \
  --debt-asset USDC \
  --debt-amount 50 \
  --collateral-asset wBTC \
  --mainnet \
  --yes
```

**Output Example:**
```text
Liquidation Complete!
════════════════════════════════════════════════════════════
  Transaction:   jkl012...mno345
  Debt Repaid:   10 XLM
  Collateral:    12.50 USDC
  Profit:        $2.50
════════════════════════════════════════════════════════════
```

> **Note:** The command checks health factor first and prevents liquidation of healthy positions.

---

### `stats` - View Protocol Statistics

Check overall Blend protocol metrics.

```bash
galaxy blend stats [options]
```

**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `--mainnet` | Use mainnet | `testnet` |
| `--json` | Output machine-readable JSON | table |

**Examples:**
```bash
# View testnet stats
galaxy blend stats

# View mainnet stats
galaxy blend stats --mainnet

# JSON output
galaxy blend stats --json
```

**Output Example:**
```text
📊 Blend Protocol Statistics
════════════════════════════════════════════════════════════
  Total Supply:      $15,234,567.00
  Total Borrow:      $8,456,234.00
  TVL:               $15,234,567.00
  Utilization Rate:  55.48%
  Last Updated:      2026-01-29 10:30:00
════════════════════════════════════════════════════════════
```

---

## Supported Assets

### Testnet

| Asset | Code | Decimals | Address |
| --- | --- | --- | --- |
| Native Stellar Lumens | XLM | 7 | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Blend Token | BLND | 7 | `CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF` |
| USD Coin | USDC | 6 | `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU` |
| Wrapped Ethereum | wETH | 18 | `CAZAQB3D7KSLSNOSQKYD2V4JP5V2Y3B4RDJZRLBFCCIXDCTE3WHSY3UE` |
| Wrapped Bitcoin | wBTC | 8 | `CAP5AMC2OHNVREO66DFIN6DHJMPOBAJ2KCDDIMFBR7WWJH5RZBFM3UEI` |

### Mainnet

Mainnet addresses will be updated when Blend Protocol launches on mainnet.

---

## Features

### Interactive Mode

All transaction commands support interactive mode when flags are omitted:

```bash
$ galaxy blend supply

? Select wallet: (Use arrow keys)
❯ dev
  prod
  liquidator

? Enter amount to supply: 100
✔ Initializing Blend Protocol...
✔ Supplying 100 XLM to Blend...
✅ Supply successful!
```

### Automatic Decimal Conversion

The CLI automatically handles decimal conversion for each asset:

- You enter human-readable amounts (e.g., `100`)
- CLI converts to contract units based on asset decimals
- No manual calculation needed

**Example:**
```bash
# You enter: --amount 100
# CLI converts:
# - XLM: 100 * 10^7 = 1,000,000,000 stroops
# - USDC: 100 * 10^6 = 100,000,000
# - wBTC: 100 * 10^8 = 10,000,000,000
```

### Network Selection

Use the `--mainnet` flag to switch between testnet and mainnet:

```bash
# Testnet (default)
galaxy blend supply --wallet dev --asset XLM --amount 100

# Mainnet
galaxy blend supply --wallet prod --asset XLM --amount 100 --mainnet
```

**Network Endpoints:**

**Testnet:**
- Horizon: `https://horizon-testnet.stellar.org`
- Soroban RPC: `https://soroban-testnet.stellar.org`
- Pool: `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`

**Mainnet:**
- Horizon: `https://horizon.stellar.org`
- Soroban RPC: `https://soroban-rpc.stellar.org`
- Pool: TBD (coming soon)

### JSON Output

All commands support `--json` flag for machine-readable output:

```bash
galaxy blend position --wallet dev --json
```

```json
{
  "supplied": [
    {"asset": {"code": "XLM"}, "amount": "100", "valueUSD": "40"}
  ],
  "borrowed": [
    {"asset": {"code": "USDC"}, "amount": "25", "valueUSD": "25"}
  ],
  "collateralValue": "40",
  "debtValue": "25",
  "healthFactor": "1.6"
}
```

---

## Common Workflows

### First Time User

```bash
# 1. Create wallet
galaxy wallet create --name dev

# 2. Fund wallet on testnet
# Visit: https://laboratory.stellar.org/#account-creator?network=test

# 3. Supply collateral
galaxy blend supply --wallet dev --asset XLM --amount 100

# 4. Check position
galaxy blend position --wallet dev

# 5. Borrow against collateral
galaxy blend borrow --wallet dev --asset USDC --amount 30

# 6. Monitor health factor
galaxy blend health --wallet dev
```

### Position Management

```bash
# Check current position
galaxy blend position --wallet dev

# Add more collateral if needed
galaxy blend supply --wallet dev --asset XLM --amount 50

# Repay some debt to improve health
galaxy blend repay --wallet dev --asset USDC --amount 10

# Verify improved health
galaxy blend health --wallet dev

# Withdraw excess collateral
galaxy blend withdraw --wallet dev --asset XLM --amount 25
```

### Liquidation Bot

```bash
#!/bin/bash
# Simple liquidation monitoring script

WALLET="liquidator"
NETWORK="--mainnet"  # or "" for testnet

while true; do
  # Monitor positions (implement your discovery mechanism)
  for borrower in $(get_borrower_addresses); do
    health=$(galaxy blend health --address $borrower $NETWORK --json | jq -r '.value')

    if (( $(echo "$health < 1.0" | bc -l) )); then
      echo "Found liquidation: $borrower (health: $health)"

      galaxy blend liquidate \
        --wallet $WALLET \
        --target $borrower \
        --debt-asset XLM \
        --debt-amount 10 \
        --collateral-asset USDC \
        $NETWORK \
        --yes
    fi
  done

  sleep 60
done
```

---

## Error Handling

The CLI handles common errors gracefully:

### Wallet Not Found
```text
❌ Error: Wallet 'dev' not found

Solution: Create wallet with 'galaxy wallet create'
```

### Insufficient Balance
```text
❌ Error: Insufficient balance for transaction

Solution: Fund wallet with testnet tokens
Visit: https://laboratory.stellar.org/#account-creator?network=test
```

### Health Factor Too Low
```text
❌ Error: Borrowing would make health factor < 1.0

Solution: Supply more collateral or borrow less
```

### Position is Healthy (Liquidation)
```text
⚠️  WARNING: Your position is at risk of liquidation!
  Health Factor: 0.95
  Only positions with health factor < 1.0 can be liquidated
```

### Network Error
```text
❌ Error: Failed to connect to Stellar network

Solution: Check network status at https://status.stellar.org
```

---

## Configuration

### Testnet Contracts

```
Pool:         CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF
Oracle:       CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI
Backstop:     CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA
Emitter:      CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6
Pool Factory: CDV6RX4CGPCOKGTBFS52V3LMWQGZN3LCQTXF5RVPOOCG4XVMHXQ4NTF6
```

### Wallet Storage

Wallets are stored in `~/.galaxy/wallets/` and are encrypted by default.

---

## Tips & Best Practices

1. **Always monitor health factor** after borrowing
2. **Start small on testnet** to understand the system
3. **Use JSON output** for scripting and automation
4. **Interactive mode** is great for learning, flags for production
5. **Decimal precision** is handled automatically
6. **Test on testnet** thoroughly before using mainnet with real funds

---

## Related

- [Blend Protocol SDK](../../packages/core/defi-protocols/src/protocols/blend/README.md)
- [Wallet Commands](./wallet.md)
- [CLI Overview](./interactive.md)
- [Blend Protocol](https://blend.capital/)
- [Blend Documentation](https://docs.blend.capital/)
