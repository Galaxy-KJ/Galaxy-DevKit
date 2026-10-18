# Local REST SDK example

Build the SDK with `npm run build --workspace @galaxy-kj/sdk-typescript`.
Start the existing REST server using its [setup instructions](../../../packages/api/rest/README.md)
and its required local service configuration. This example does not provision
databases, create wallets, sign transactions or submit funds.

Set `GALAXY_API_URL` to the server root (default `http://127.0.0.1:3000`). Then:

```sh
node docs/examples/sdk/local-rest.mjs --probe
```

This sends an intentionally incomplete aggregator request and checks for the
real REST `400 VALIDATION_ERROR` response. It verifies route reachability and SDK
error handling, not a successful quote or chain integration.

For a real read-only quote, set `GALAXY_ASSET_OUT` to a testnet asset supported by
the server's configured protocols and run without `--probe`. Optionally set
`GALAXY_API_KEY`. The server must have working Horizon/Soroban endpoints and
protocol configuration. The example fails on unavailable services; it never
substitutes a fabricated quote.

The checked-in example imports the built ESM artifact directly so it works from
a checkout without publishing. Installed consumers use
`import { GalaxyClient } from '@galaxy-kj/sdk-typescript'`. Wallet, oracle and
automation REST services, mainnet selection and OpenAPI generation remain
unavailable; see the [SDK README](../../../packages/sdk/typescript/README.md).
