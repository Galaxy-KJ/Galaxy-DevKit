# Galaxy CLI Watch Mode

The `watch` command group provides **real-time monitoring** of the Stellar network directly from your terminal with live dashboard updates.

## Commands Overview

| Command | Description |
|---------|-------------|
| `galaxy watch account <address>` | Monitor account balance and payments |
| `galaxy watch transaction <hash>` | Track transaction until confirmation |
| `galaxy watch oracle <symbol>` | Stream price updates from oracles |
| `galaxy watch contract <id>` | Monitor Soroban contract events |
| `galaxy watch network` | View live ledger and TPS stats |
| `galaxy watch dashboard` | Multi-panel combined view |

---

## Watch Account

Monitor account balance, payments, and transaction history in real-time.

```bash
galaxy watch account <address> [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--network <testnet\|mainnet>` | Specify the network | `testnet` |
| `--json` | Output raw JSON stream (no UI) | `false` |
| `--interval <seconds>` | Balance check frequency | `5` |

**Examples:**

```bash
# Monitor account on testnet with dashboard UI
galaxy watch account GABC...XYZ

# Monitor with faster updates (every 3 seconds)
galaxy watch account GABC...XYZ --interval 3

# Stream JSON for piping to other tools
galaxy watch account GABC...XYZ --json | jq '.amount'
```

---

## Watch Transaction

Track a specific transaction until it is confirmed on the ledger or times out.

```bash
galaxy watch transaction <hash> [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--network <testnet\|mainnet>` | Specify the network | `testnet` |
| `--timeout <seconds>` | Maximum wait time | `60` |
| `--json` | Output result as JSON | `false` |

**Examples:**

```bash
# Track with default 60s timeout
galaxy watch transaction 7a8b...123f

# Track with custom 30s timeout
galaxy watch transaction 7a8b...123f --timeout 30

# Get JSON output for scripts
galaxy watch transaction 7a8b...123f --json
```

---

## Watch Oracle

Stream live price updates for assets from oracle sources.

```bash
galaxy watch oracle <symbol> [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--network <testnet\|mainnet>` | Specify the network | `testnet` |
| `--interval <seconds>` | Update frequency | `5` |
| `--json` | Output stream as JSON | `false` |

**Supported Symbols:** XLM, BTC, ETH, USDC, USDT, EUR

**Examples:**

```bash
# Watch XLM price with chart
galaxy watch oracle XLM

# Faster updates for trading
galaxy watch oracle BTC --interval 2

# JSON stream for price alerts
galaxy watch oracle ETH --json | while read line; do
  echo "$line" | jq -r 'if .price > 3000 then "ALERT: ETH above $3000!" else empty end'
done
```

---

## Watch Contract

Monitor Soroban smart contract events using Soroban RPC.

```bash
galaxy watch contract <contract-id> [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--event <name>` | Filter by event name | All events |
| `--network <testnet\|mainnet>` | Specify the network | `testnet` |
| `--interval <seconds>` | Polling interval | `5` |
| `--json` | Output stream as JSON | `false` |

**Examples:**

```bash
# Watch all events from a contract
galaxy watch contract CDLZ...ABC

# Filter to specific event type
galaxy watch contract CDLZ...ABC --event transfer

# JSON stream for logging
galaxy watch contract CDLZ...ABC --json >> contract-events.log
```

---

## Watch Network

View live network statistics including ledger closing times and Transactions Per Second (TPS).

```bash
galaxy watch network [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--network <testnet\|mainnet>` | Specify the network | `testnet` |

**Examples:**

```bash
# Monitor testnet activity
galaxy watch network

# Monitor mainnet
galaxy watch network --network mainnet
```

---

## Dashboard

A combined view showing network health, market prices, and global transaction activity.

```bash
galaxy watch dashboard [options]
# or
galaxy watch --dashboard
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `--network <testnet\|mainnet>` | Specify the network | `testnet` |

**Dashboard Panels:**

- **Network Activity** - Live ledger updates with TPS
- **Market Prices** - XLM, BTC, ETH, USDC prices
- **Transaction Stream** - Global transaction feed

---

## Dashboard Interaction

- **q / Esc / Ctrl+C**: Exit the monitoring mode and return to normal terminal
- **Scroll**: Use the mouse or arrow keys to scroll through log panels

---

## Auto-Reconnection

All streaming commands include automatic reconnection:

- **3 retry attempts** with exponential backoff
- Graceful handling of network disconnections
- Status messages during reconnection

---

## Rate Limiting

The CLI handles Horizon rate limiting automatically:

- Detects 429 (Too Many Requests) responses
- Respects `Retry-After` headers
- Pauses requests until rate limit clears

---

## JSON Output Mode

All commands support `--json` flag for machine-readable output:

```bash
# Pipe to jq for filtering
galaxy watch account GABC...XYZ --json | jq 'select(.type == "payment")'

# Log to file
galaxy watch network --json >> network-log.jsonl

# Integration with alerting systems
galaxy watch oracle XLM --json | your-alert-script
```

---

## Troubleshooting

### Connection Issues

```
Stream disconnected, reconnecting in 1000ms (attempt 1/3)...
```

This is normal during network hiccups. The CLI will automatically retry.

### Rate Limiting

If you see frequent pauses, try:
- Increasing `--interval` to reduce request frequency
- Using a dedicated Horizon server

### Transaction Timeout

If a transaction times out:
- The transaction may still be pending
- Check the Stellar Explorer for current status
- Increase `--timeout` for longer waits

---

## See Also

- [Wallet Commands](./wallet.md)
- [Oracle Commands](./oracle.md)
- [Interactive Mode](./interactive.md)
