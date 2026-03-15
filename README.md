# Rhaios Skills

Agent skills for [Rhaios](https://rhaios.com) — yield intelligence for DeFi. Compatible with [Claude Code](https://code.claude.com), [OpenClaw](https://openclaw.ai), and any tool implementing the [Agent Skills](https://agentskills.io) standard.

## Install

Pick your platform — one command to start:

### OpenClaw

```bash
clawhub install rhaios-staging
```

### Claude Code

```
/plugin marketplace add Rhaios/rhaios-skills
```

### Manual

```bash
git clone https://github.com/Rhaios/rhaios-skills.git
cd rhaios-skills/skills/rhaios-staging
bun install
```

Then symlink for Claude Code:

```bash
ln -s $(pwd) ~/.claude/skills/rhaios-staging
```

## Quickstart

Once installed, ask your agent:

> Discover the best USDC vault on Base and do a dry-run deposit of 1 USDC.

Or run the skill script directly:

```bash
cat <<'JSON' | bun run --cwd skills/rhaios-staging prepare-sign-execute
{
  "operation": "deposit",
  "deposit": { "asset": "USDC", "amount": "1", "vaultId": "124" },
  "controls": { "dryRun": true, "strictMode": true, "requireConfirm": false }
}
JSON
```

Staging uses managed test RPCs (Anvil forks of mainnet) — no real funds required. Fund your test wallet via the [fund-wallet endpoint](https://docs.rhaios.com/tools/testing_fund_wallet).

## What you get

The **rhaios-staging** skill gives your agent a complete yield workflow:

1. **Discover** — browse and rank vaults by APY, risk, TVL, and Sharpe ratio
2. **Prepare** — build a deposit, redeem, or rebalance intent
3. **Sign** — sign with your agent's own keys (non-custodial)
4. **Execute** — submit the signed transaction

## Links

- [Documentation](https://docs.rhaios.com)
- [Installation guide](https://docs.rhaios.com/installation)
- [API reference](https://docs.rhaios.com/tools/yield_discover)
- [llms.txt](https://staging.rhaios.com/llms.txt) — machine-readable summary

## License

MIT
