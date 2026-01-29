# Galaxy Oracle CLI Commands

Query oracle price data from the command line with support for multiple aggregation strategies, custom sources, and historical data.

## Overview

The `galaxy oracle` command group provides tools to query, validate, and monitor cryptocurrency prices from multiple oracle sources.

```bash
galaxy oracle <subcommand> [options]
```

## Subcommands

### `price` - Get Current Price

Query the current aggregated price for an asset.

```bash
galaxy oracle price <symbol> [options]
```

**Arguments:**
- `<symbol>` - Asset pair (e.g., `XLM/USD`, `BTC/USD`)


**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-s, --strategy <name>` | Aggregation strategy: `median`, `mean`, `twap`, `weighted` | `median` |
| `--sources <list>` | Comma-separated source names to use | all |
| `--network <name>` | Oracle network: `testnet` or `mainnet` | `testnet` |
| `--json` | Output machine-readable JSON | table |
| `-w, --watch [interval]` | Watch for real-time updates | off (5s default) |


**Examples:**
```bash
# Get current XLM price using median strategy
galaxy oracle price XLM/USD

# Get price using mean averaging
galaxy oracle price XLM/USD --strategy mean

# Watch price updates every 10 seconds
galaxy oracle price XLM/USD --watch 10s

# Get JSON output from specific sources
galaxy oracle price BTC/USD --sources coingecko,binance --json
```

**Output Example:**
```text
┌──────────────┬──────────────────┐
│ Field        │ Value            │
├──────────────┼──────────────────┤
│ Symbol       │ XLM/USD          │
│ Price        │ ▲ 0.12           │
│ Confidence   │ 95.00%           │
│ Sources Used │ 3/3              │
│ Updated      │ 2s ago           │
└──────────────┴──────────────────┘
```

> **Note:** In watch mode, prices are color-coded:
> - 🟢 Green (▲) = Price increased
> - 🔴 Red (▼) = Price decreased

---

### `history` - Historical Data & TWAP

Poll and display historical prices with Time-Weighted Average Price (TWAP) calculation.

```bash
galaxy oracle history <symbol> --period <duration> [options]
```

**Arguments:**
- `<symbol>` - Asset pair (e.g., `XLM/USD`)


**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-p, --period <duration>` | Polling duration (e.g., `1m`, `1h`) | **required** |
| `-i, --interval <duration>` | Polling interval | `5s` |
| `--sources <list>` | Comma-separated source names | all |
| `--network <name>` | Oracle network | `testnet` |
| `--json` | Output machine-readable JSON | table |


**Examples:**
```bash
# Collect 1 hour of price data
galaxy oracle history XLM/USD --period 1h

# Collect data every 30 seconds for 5 minutes
galaxy oracle history XLM/USD --period 5m --interval 30s --json
```

---

### `sources` - Manage Oracle Sources

List available sources or add custom oracle endpoints.

#### List Sources

```bash
galaxy oracle sources list [options]
```


**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `--sources <list>` | Filter specific sources | all |
| `--network <name>` | Oracle network | `testnet` |
| `--json` | Output machine-readable JSON | table |


**Output Example:**
```text
┌──────────────┬─────────┬────────┬─────────┬──────────┐
│ Name         │ Type    │ Weight │ Health  │ Failures │
├──────────────┼─────────┼────────┼─────────┼──────────┤
│ coingecko    │ default │ 1.0    │ healthy │ 0        │
│ coinmarketcap│ default │ 1.0    │ healthy │ 0        │
│ binance      │ default │ 1.0    │ healthy │ 0        │
└──────────────┴─────────┴────────┴─────────┴──────────┘
```

#### Add Custom Source

```bash
galaxy oracle sources add <name> <url> [options]
```

**Arguments:**
- `<name>` - Source identifier (lowercase, alphanumeric)
- `<url>` - API endpoint URL (must include `{symbol}` placeholder)


**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-w, --weight <value>` | Source weight for aggregation | `1.0` |
| `-d, --description <text>` | Optional description | - |


**Example:**
```bash
galaxy oracle sources add myapi "https://api.example.com/price?symbol={symbol}" --weight 1.5
```

---

### `validate` - Check Price Data Quality

Validate price data across sources for anomalies and staleness.

```bash
galaxy oracle validate <symbol> [options]
```

**Arguments:**
- `<symbol>` - Asset pair to validate


**Options:**

| Option | Description | Default |
| --- | --- | --- |
| `-t, --threshold <percent>` | Maximum deviation threshold | `5` |
| `--max-age <duration>` | Maximum acceptable price age | `60s` |
| `--sources <list>` | Sources to validate | all |
| `--network <name>` | Oracle network | `testnet` |
| `--json` | Output machine-readable JSON | table |


**Examples:**
```bash
# Validate with 5% deviation threshold
galaxy oracle validate XLM/USD

# Strict validation with 2% threshold
galaxy oracle validate XLM/USD --threshold 2 --max-age 30s
```

**Output Example:**
```text
┌──────────────┬───────┬───────────────────────┬─────────┬────────┐
│ Source       │ Price │ Timestamp             │ Status  │ Issues │
├──────────────┼───────┼───────────────────────┼─────────┼────────┤
│ coingecko    │ 0.12  │ 2026-01-28T12:00:00Z  │ valid   │ none   │
│ binance      │ 0.12  │ 2026-01-28T12:00:01Z  │ valid   │ none   │
└──────────────┴───────┴───────────────────────┴─────────┴────────┘
```

---

### `strategies` - List Aggregation Strategies

Display all available price aggregation strategies.

```bash
galaxy oracle strategies [--json]
```


**Output:**

| Strategy | Description |
| --- | --- |
| `median` | Median of source prices (default) |
| `mean` | Simple arithmetic average of source prices |
| `twap` | Time-weighted average based on price recency |
| `weighted` | Weighted average using configured source weights |


---

## Features

### Caching
Results are cached for **30 seconds** to avoid rate limiting. Subsequent requests within this window return cached data.

### Retry Logic
Network errors trigger automatic retries with exponential backoff:
- Up to 3 attempts
- Base delay: 500ms (doubles each retry)
- Rate-limiting and invalid responses do not retry

### Error Handling
The CLI handles common errors gracefully:
- Rate limiting: Shows friendly message to wait
- Network failures: Retries automatically
- Invalid data: Reports source issues

---

## Configuration

Custom sources are stored in `.galaxy/oracles.json` in the current working directory:

```json
{
  "sources": [
    {
      "name": "myapi",
      "url": "https://api.example.com/price?symbol={symbol}",
      "weight": 1.5,
      "description": "My custom oracle API"
    }
  ]
}
```

---

## Related

- [Oracle Core Package](../../packages/core/oracles/README.md)
- [CLI Overview](./interactive.md)
