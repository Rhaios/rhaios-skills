# Rhaios Skills

Agent skills for interacting with the [Rhaios](https://rhaios.com) DeFi yield API. Compatible with [Claude Code](https://claude.ai/code), [OpenClaw](https://openclaw.ai), and any tool implementing the [Agent Skills](https://agentskills.io) standard.

## Skills

| Skill | Description |
|-------|-------------|
| [rhaios-staging](./rhaios-staging/) | Yield operations (deposit/redeem/rebalance) via the Rhaios staging API |

## Install

### Claude Code

Symlink into your personal skills directory:

```bash
ln -s /path/to/rhaios-skills/rhaios-staging ~/.claude/skills/rhaios-staging
```

Or install as a plugin:

```bash
/plugin add rhaios/rhaios-skills
```

### OpenClaw

```bash
clawhub install rhaios-staging
```

### Manual

```bash
git clone https://github.com/rhaios/rhaios-skills.git
cd rhaios-skills/rhaios-staging
bun install
```

## License

MIT
