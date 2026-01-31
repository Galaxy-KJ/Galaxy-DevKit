# Blend CLI - Quick Reference Guide

## Installation

```bash
# Install Galaxy CLI
npm install -g @galaxy/cli

# Or use from project root
cd Galaxy-DevKit-1
npm run build
```

## Quick Start

```bash
# 1. Create a wallet
galaxy wallet create

# 2. Get testnet funds
# Visit: https://laboratory.stellar.org/#account-creator?network=test

# 3. Supply assets to Blend
galaxy blend supply --wallet dev --asset XLM --amount 100

# 4. Check your position
galaxy blend position --wallet dev
```

## Command Reference

### Supply
```bash
galaxy blend supply [options]

Options:
  -w, --wallet <name>     Wallet name to use
  -a, --asset <code>      Asset code (XLM, USDC, BLND, wBTC, wETH)
  -i, --issuer <address>  Asset issuer (not needed for XLM)
  --amount <amount>       Amount to supply
  --mainnet              Use mainnet (default: testnet)
  --json                 Output as JSON

Examples:
  galaxy blend supply
  galaxy blend supply --wallet dev --asset XLM --amount 100
  galaxy blend supply --wallet prod --asset USDC --amount 500 --mainnet
```

### Withdraw
```bash
galaxy blend withdraw [options]

Options: Same as supply

Examples:
  galaxy blend withdraw
  galaxy blend withdraw --wallet dev --asset XLM --amount 50
```

### Borrow
```bash
galaxy blend borrow [options]

Options: Same as supply

Examples:
  galaxy blend borrow
  galaxy blend borrow --wallet dev --asset USDC --amount 25
```

### Repay
```bash
galaxy blend repay [options]

Options: Same as supply

Examples:
  galaxy blend repay
  galaxy blend repay --wallet dev --asset USDC --amount 10
```

### Position
```bash
galaxy blend position [options]

Options:
  -w, --wallet <name>     Wallet name
  -a, --address <address> Address to check (optional)
  --mainnet              Use mainnet
  --json                 Output as JSON

Examples:
  galaxy blend position --wallet dev
  galaxy blend position --address GBORROWER...
```

### Health
```bash
galaxy blend health [options]

Options: Same as position

Examples:
  galaxy blend health --wallet dev
  galaxy blend health --address GBORROWER...
```

### Liquidate
```bash
galaxy blend liquidate [options]

Options:
  -w, --wallet <name>           Your liquidator wallet
  -t, --target <address>        Address to liquidate
  --debt-asset <code>           Debt asset to repay
  --debt-amount <amount>        Amount of debt to repay
  --collateral-asset <code>     Collateral asset to receive
  --mainnet                     Use mainnet
  --yes                         Skip confirmation
  --json                        Output as JSON

Examples:
  galaxy blend liquidate \
    --wallet liquidator \
    --target GBORROWER... \
    --debt-asset XLM \
    --debt-amount 10 \
    --collateral-asset USDC
```

### Stats
```bash
galaxy blend stats [options]

Options:
  --mainnet  Use mainnet
  --json     Output as JSON

Examples:
  galaxy blend stats
  galaxy blend stats --mainnet
```

## Supported Assets

### Testnet
| Asset | Decimals | Address |
|-------|----------|---------|
| XLM | 7 | CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC |
| BLND | 7 | CB22KRA3YZVCNCQI64JQ5WE7UY2VAV7WFLK6A2JN3HEX56T2EDAFO7QF |
| USDC | 6 | CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU |
| wETH | 18 | CAZAQB3D7KSLSNOSQKYD2V4JP5V2Y3B4RDJZRLBFCCIXDCTE3WHSY3UE |
| wBTC | 8 | CAP5AMC2OHNVREO66DFIN6DHJMPOBAJ2KCDDIMFBR7WWJH5RZBFM3UEI |

## Network Endpoints

### Testnet (default)
- Horizon: https://horizon-testnet.stellar.org
- Soroban RPC: https://soroban-testnet.stellar.org
- Pool: CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF

### Mainnet (--mainnet)
- Horizon: https://horizon.stellar.org
- Soroban RPC: https://soroban-rpc.stellar.org
- Pool: TBD (coming soon)

## Health Factor Guide

| Range | Status | Action |
|-------|--------|--------|
| > 1.5 | ✅ Healthy | Safe to borrow more |
| 1.2 - 1.5 | ⚠️ Caution | Consider adding collateral |
| 1.0 - 1.2 | 🔴 At Risk | Add collateral or repay debt |
| < 1.0 | ⚠️ Liquidatable | Position can be liquidated |

## Interactive Mode

All transaction commands support interactive mode when flags are omitted:

```bash
# Run without flags to get prompts
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

## JSON Output

Add `--json` flag to any command for machine-readable output:

```bash
$ galaxy blend position --wallet dev --json
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

## Common Workflows

### Lending (Supply Only)
```bash
# Supply XLM to earn interest
galaxy blend supply --wallet dev --asset XLM --amount 1000

# Check accrued interest over time
galaxy blend position --wallet dev

# Withdraw principal + interest
galaxy blend withdraw --wallet dev --asset XLM --amount 1050
```

### Leveraged Borrowing
```bash
# 1. Supply collateral
galaxy blend supply --wallet dev --asset XLM --amount 1000

# 2. Borrow against it (maintain healthy ratio)
galaxy blend borrow --wallet dev --asset USDC --amount 300

# 3. Monitor health
galaxy blend health --wallet dev

# 4. Repay when ready
galaxy blend repay --wallet dev --asset USDC --amount 300

# 5. Withdraw collateral
galaxy blend withdraw --wallet dev --asset XLM --amount 1000
```

### Liquidation Bot
```bash
#!/bin/bash
# Simple liquidation monitor

WALLET="liquidator"
NETWORK="--mainnet"  # or "" for testnet

while true; do
  # Get list of borrowers (implement your own discovery)
  for borrower in $(get_borrower_addresses); do
    health=$(galaxy blend health --address $borrower $NETWORK --json | jq -r '.value')

    if (( $(echo "$health < 1.0" | bc -l) )); then
      echo "Found liquidation opportunity: $borrower (health: $health)"

      # Execute liquidation (adjust amounts as needed)
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

  sleep 60  # Check every minute
done
```

## Troubleshooting

### Command not found
```bash
# If galaxy command not found, use from project:
cd Galaxy-DevKit-1
npm run cli -- blend <command>
```

### Wallet not found
```bash
# List available wallets
galaxy wallet list

# Create new wallet
galaxy wallet create --name dev
```

### Insufficient balance
```bash
# Check wallet balance
galaxy wallet balance --name dev

# Fund testnet wallet
# Visit: https://laboratory.stellar.org/#account-creator?network=test
```

### Network errors
```bash
# Check Stellar network status
# Visit: https://status.stellar.org

# Try again with longer timeout
# (Timeout handling is automatic in CLI)
```

### Transaction simulation failed
```bash
# Common causes:
# - Insufficient balance for transaction + fees
# - Borrowing too much (would make health < 1.0)
# - Trying to withdraw more than supplied
# - Asset not available in pool

# Check position first
galaxy blend position --wallet dev
```

## Tips

1. **Always monitor health factor** after borrowing
2. **Start small** on testnet to understand the system
3. **Use JSON output** for scripting and automation
4. **Interactive mode** is great for learning, flags for scripting
5. **Decimal precision** is handled automatically - just use normal numbers
6. **Test on testnet** before using mainnet with real funds

## Links

- Blend Protocol: https://blend.capital/
- Testnet UI: https://testnet.blend.capital/
- Documentation: https://docs.blend.capital/
- Stellar Laboratory: https://laboratory.stellar.org/
- Galaxy DevKit: https://github.com/Galaxy-DevKit/

## Support

For issues or questions:
- GitHub Issues: https://github.com/Galaxy-DevKit/issues
- Discord: [Coming soon]
- Documentation: See README files in project
