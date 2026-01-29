# Galaxy CLI Watch Mode

The `watch` command group provides real-time monitoring of the Stellar network directly from your terminal.

## Commands

### Watch Account

Monitor account balance, payments, and transaction history in real-time.

```bash
galaxy watch account <address>
```

**Options:**

- `--network <testnet|mainnet>`: Specify the network (default: testnet)
- `--json`: Output raw JSON stream instead of the dashboard UI.
- `--interval <seconds>`: Frequency of balance checks (default: 5)

### Watch Transaction

Track a specific transaction until it is confirmed on the ledger.

```bash
galaxy watch transaction <tx-hash>
```

### Watch Oracle

Stream live price updates for assets from supported oracle providers.

```bash
galaxy watch oracle <symbol>
```

### Watch Network

View live network statistics including ledger closing times and Transactions Per Second (TPS).

```bash
galaxy watch network
```

### Dashboard

A combined view showing network health, market prices, and global activity.

```bash
galaxy watch --dashboard
# or
galaxy watch dashboard
```

## Dashboard Interaction

- **q / Esc / Ctrl+C**: Exit the monitoring mode and return to normal terminal.
- **Scroll**: Use the mouse or arrow keys to scroll through log panels.

## Examples

**Monitor a Testnet account:**

```bash
galaxy watch account GABC...XYZ --network testnet
```

**Track a transaction deployment:**

```bash
galaxy watch transaction 7a8b...123f
```
