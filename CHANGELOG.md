# Changelog

## Unreleased

### Security

- Require Next.js 15.5.28 or newer in DApp templates and refresh the workspace
  lockfile to address GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r.

### CLI deployment

- Replace simulated deployments with `galaxy deploy contract <name> --network testnet`.
  Requires Stellar CLI, Rust, and a funded `STELLAR_SECRET_KEY` environment variable.
  Builds WASM and reports the confirmed contract ID and transaction hash.
- Remove the simulated `--verify`, `--gas-limit`, and application deployment paths.
  Legacy `--env` and `--contract` options are replaced by the contract subcommand;
  application hosting must use the hosting provider's own tools.
