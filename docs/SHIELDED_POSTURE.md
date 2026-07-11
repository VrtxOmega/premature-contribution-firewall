# Shielded Posture

Shielded posture turns on PCF's maintainer stack in read-only mode. It strengthens maintainer context without pretending to detect AI authorship.

## What shielded means

- `PCF_SHIELDED=true` or Action input `shielded: true`
- Dry-run stays enforced; no GitHub writes
- Maintainer stack layers activate
- Assurance defaults to **high** unless `assurance-level: standard` is set

## Assurance levels

| Level | Behavioral signals | Author context | Vouch context | Strict issue forms | Semantic duplicate assist | Dry-run required |
| --- | --- | --- | --- | --- | --- | --- |
| standard | yes | yes | yes | no | no | no |
| high | yes | yes | yes | yes | yes | yes |

High assurance adds deterministic duplicate assist (token overlap, not LLM) and strict issue-form validation.

## Non-claims

- Shielded posture is maintainer context, not AI-authorship detection
- Author trust bands are context only unless a project maps them to enforcement
- Companion tools (anti-slop, Good Egg, Vouch) remain opt-in outside PCF

## Environment variables

```bash
PCF_SHIELDED=true
PCF_ASSURANCE_LEVEL=high
PCF_MAINTAINER_STACK=true
```

`PCF_MAINTAINER_STACK=true` enables the stack without forcing shielded dry-run semantics.

## GitHub Action

```yaml
- uses: VrtxOmega/premature-contribution-firewall@v0.1.3
  with:
    shielded: "true"
    assurance-level: high
```

See [MAINTAINER_STACK.md](MAINTAINER_STACK.md) for layer details and [fixtures/workflows/pcf-shielded-stack.yml](../fixtures/workflows/pcf-shielded-stack.yml) for a full workflow example.
