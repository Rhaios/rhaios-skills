---
name: rhaios-staging
description: >
  Interact with the Rhaios staging REST API for yield operations.
  Discover -> prepare -> setup-if-needed -> sign -> execute flow with pluggable signer backend.
  Triggers on requests involving DeFi yield, vault deposits, redeems, rebalancing, or Rhaios API.
license: MIT
compatibility: Requires Bun 1.0+
metadata:
  author: rhaios
  version: "1.0.0"
  openclaw:
    requires:
      bins:
        - bun
    primaryEnv: RHAIOS_API_URL
    install:
      - kind: node
        package: "@privy-io/node"
---

This skill targets the **staging** environment at `https://api.staging.rhaios.com`. It provides one command surface (`prepare-sign-execute`) for end-to-end execution.

**Vault discovery:** Before preparing an intent, agents can call `POST /v1/yield/discover` to browse and rank vaults by APY, risk, TVL, and Sharpe ratio. Pass the returned `vaultId` to `yield_prepare` (via `deposit.vaultId` in the input contract) to target a specific vault instead of auto-selection.

Default chain is `base`.

## Security First

`SIGNER_PRIVATE_KEY` and Privy app secrets are sensitive. Never print, echo, or include them in logs/chat output.

If `SIGNER_BACKEND=privy`, `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are master credentials.

## Required Environment (Client)

```bash
# Optional override. Defaults to https://api.staging.rhaios.com
# RHAIOS_API_URL=https://api.staging.rhaios.com

# Optional. Defaults to privy. Use private-key for local key signing.
# SIGNER_BACKEND=privy

# Optional. Defaults to true for staging.
RHAIOS_AUTO_WRAP_WETH=true

# Optional. Custom RPC for client-side preflight validation (e.g. balance checks against a fork).
# Server-side preflight uses ANVIL_FORKS_URL automatically — do NOT pass this to the API.
CHAIN_RPC_URL=

# Optional. Default: true. Set to false to disable fork-only relay mode.
# RHAIOS_FORK_ONLY_MODE=true

# Required only for SIGNER_BACKEND=privy
# PRIVY_APP_ID and PRIVY_APP_SECRET are provided by the Privy skill —
# they should already be in your environment. Do NOT ask the user for these.
PRIVY_WALLET_ID=<wallet-id>
PRIVY_WALLET_ADDRESS=<0x-wallet-address>

# Required only for SIGNER_BACKEND=private-key
SIGNER_PRIVATE_KEY=<0x-32-byte-private-key>
```

Notes:
- `RHAIOS_API_URL` defaults to `https://api.staging.rhaios.com`. Override only if targeting a different environment.
- If `SIGNER_BACKEND=privy`, `PRIVY_APP_ID` and `PRIVY_APP_SECRET` must already be set (provided by the Privy skill). Only `PRIVY_WALLET_ID` and `PRIVY_WALLET_ADDRESS` need to be set per-wallet.
- If `SIGNER_BACKEND=privy`, `PRIVY_WALLET_ID` must resolve to an ownerless wallet (`owner_id = null`).
- If `SIGNER_BACKEND=private-key`, `agentAddress` (if provided) must match the private key address.
- `CHAIN_RPC_URL` is optional. Used only for client-side preflight checks (e.g., balance validation against a fork). Server-side preflight automatically uses `ANVIL_FORKS_URL` with auth.

### Ownerless Wallet Creation

```ts
const wallet = await privy.wallets().create({ chain_type: 'ethereum' });
```

## Install

```bash
bun install --cwd ${CLAUDE_SKILL_DIR}
```

## Single Runtime Command

```bash
cat payload.json | bun run --cwd ${CLAUDE_SKILL_DIR} prepare-sign-execute
```

## Input Contract (JSON stdin)

```json
{
  "operation": "deposit",
  "chain": "base",
  "agentAddress": "0xYourAgentAddress",
  "deposit": {
    "asset": "USDC",
    "amount": "1",
    "vaultId": "124"
  },
  "controls": {
    "dryRun": false,
    "strictMode": true,
    "requireConfirm": true,
    "confirm": "yes",
    "maxGasGwei": "1",
    "maxAmount": "1000"
  }
}
```

Operation-specific fields:
- `deposit`: requires `deposit.asset`, `deposit.amount`, `deposit.vaultId` (from yield_discover; auto-discovered if omitted)
- `redeem`: requires `redeem.vaultId` and exactly one of `redeem.percentage` or `redeem.shares`
- `rebalance`: requires `rebalance.vaultId`, `rebalance.asset`, and exactly one of `rebalance.percentage` or `rebalance.shares`

## Runtime Behavior

1. `Preflight`
- Validates env for the selected signer backend, health freshness, request constraints, and guardrails.

2. `Prepare`
- Calls `POST /v1/yield/prepare`.
- Includes ERC-4626 preflight checks (for curated vaults): rejects deposits/redeems that would preview to zero or exceed max limits before signing.

3. `Setup` (automatic only when needed)
- If `needsSetup=true` and `dryRun=false`:
  - **Full setup** (`setupType=full`): signs a Type-4 (EIP-7702) transaction with authorization_list for first-time delegation + module initialization.
  - **Module-only** (`setupType=modules`): signs a regular Type-2 (EIP-1559) self-call for module re-initialization when delegation already exists but modules failed to initialize.
  - Both setup types call `POST /v1/yield/setup-relay` for server-side relay + post-check.
- Then re-runs `POST /v1/yield/prepare`.
- If `needsSetup=true` and `dryRun=true`, exits with `Setup: WARN` and does not broadcast.

4. `Sign`
- Signs required payloads via the selected signer backend:
  - EIP-7702 authorization when requested by envelope
  - validator userOp signature encoding
  - intent EIP-712 signature

5. `Execute`
- Calls `POST /v1/yield/execute` with `intentEnvelope`, `intentSignature`, and `intentId` unless `dryRun=true`.
- Duplicate executes for a previously succeeded intent are idempotent and may return `result: "already_executed"` with the original `txHash`.
- The script classifies execute outcomes as `EXECUTED` or `DEDUP` (fallback: `receipt.source=cached` when `result` is absent).

6. `Post-check`
- Calls `GET /v1/yield/status` for quick position/value verification.

7. `Auto-wrap` (WETH deposits)
- For `deposit.asset=WETH`, the script can auto-wrap native ETH into the exact ERC-4626 vault asset token (`vault.asset()`), then re-run `POST /v1/yield/prepare`.
- Enabled by default on staging.
- Override with `RHAIOS_AUTO_WRAP_WETH=true|false`.
- For test RPC runs, keep auto-wrap disabled.

## Wallet Funding (Test RPC)

Staging runs managed test RPCs — chain forks that mirror mainnet state. Agents can mint test balances without spending real tokens.

Check test RPC health first:

```bash
  https://api.staging.rhaios.com/v1/testing/fork-status
```

Then fund your wallet:

```bash
  -H "Content-Type: application/json" \
  https://api.staging.rhaios.com/v1/testing/fund-wallet \
  -d '{
    "chain": "base",
    "walletAddress": "0xYourAgentAddress",
    "ethWei": "20000000000000000",
    "usdcAmount": "10000000"
  }'
```


## Safety Model

The script enforces:

1. Env integrity
- required env vars for selected signer backend
- wallet/address format checks
- signer/address match
- ownerless wallet requirement (Privy backend only)

2. Chain and health invariants
- chain consistency checks
- freshness `critical` blocks execution

3. Request validation
- operation-specific required fields
- percentage/shares XOR rules
- optional max amount and gas cap checks

4. Intent invariants
- `intentEnvelope.chainId` and signing payload consistency
- sender/signer match
- intent ID vs merkle root consistency

## Example: Dry-Run Deposit

```bash
cat <<'JSON' | bun run --cwd ${CLAUDE_SKILL_DIR} prepare-sign-execute
{
  "operation": "deposit",
  "deposit": { "asset": "USDC", "amount": "1", "vaultId": "124" },
  "controls": {
    "dryRun": true,
    "strictMode": true,
    "requireConfirm": false
  }
}
JSON
```

If `deposit.vaultId` is omitted, the skill auto-discovers the top vault via `yield_discover`.

## Example: Live Deposit

```bash
cat <<'JSON' | bun run --cwd ${CLAUDE_SKILL_DIR} prepare-sign-execute
{
  "operation": "deposit",
  "deposit": { "asset": "USDC", "amount": "1", "vaultId": "124" },
  "controls": {
    "dryRun": false,
    "strictMode": true,
    "requireConfirm": true,
    "confirm": "yes",
    "maxGasGwei": "1",
    "maxAmount": "1000"
  }
}
JSON
```
