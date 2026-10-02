# Install, verify, and upgrade PCF

PCF requires Node.js 22 or newer and npm. The npm CLI/MCP package and the GitHub
Action are separate install paths. The browser UI and development commands need
a source checkout.

## Released versus current source

As of October 2, 2026, npm `latest` and the GitHub release are both **v0.2.0**.
The release's npm `gitHead` and Git tag identify commit
`8739108af4055c9ac72b033a7da4df770aa43272`.

| Capability | Published v0.2.0 | Current source, unreleased |
| --- | --- | --- |
| Preflight, evaluation, lifecycle CLI; `pcf-mcp` | Available | Available |
| Claim-integrity, falsification, residue-register CLI and MCP tools | Unavailable | Available |
| Mandatory `claimIntegrity` contribution-lane gate | Unavailable | Required |
| Later repro-authority, freshness, and Windows portability hardening | Unavailable | Included |
| Packaged-install verification from a checkout | Unavailable | `npm run package:verify` |

Current source still has `version: 0.2.0` in its manifest. That field does **not**
make a locally packed tarball the published release. Record the source commit and
the verifier's tarball SHA-512 identity when testing a candidate.

## Try the released CLI

Check the installed toolchain and print help without needing any repository files:

```bash
node --version
npm --version
npx --yes --package=premature-contribution-firewall@0.2.0 pcf --help
```

For a complete sample, create a scratch project. These commands work in a POSIX
shell and PowerShell:

```bash
mkdir pcf-demo
cd pcf-demo
npm init -y
npm install --save-exact --ignore-scripts premature-contribution-firewall@0.2.0
node -e "require('node:fs').copyFileSync('node_modules/premature-contribution-firewall/fixtures/pr-ready.json', 'draft.json')"
npm exec --offline -- pcf preflight draft.json --format json
```

Expect `ready: true` and exit code **0** for that synthetic fixture. Substitute
your own draft to get an advisory result: **1** means not ready and **2** means
usage error. A fixture pass does not validate your contribution or predict
maintainer acceptance. Package installation uses the registry; the preflight
command evaluates the local input without GitHub access.

For MCP clients, select the package explicitly so npm resolves the server bin:

```json
{
  "command": "npx",
  "args": ["--yes", "--package=premature-contribution-firewall@0.2.0", "pcf-mcp"]
}
```

The process speaks JSON-RPC over stdio and waits for a client. The three
claim-integrity/falsification/residue tools listed in current-source MCP docs are
not part of this released configuration. See [MCP usage](MCP.md).

Prospective study storage needs POSIX permissions. Use Linux or Node inside WSL
with the study root on its Linux filesystem. Native Windows study storage is
unsupported; current source rejects it before store access. This limitation does
not prevent the CLI/MCP smoke checks above.

## Upgrade an existing installation

Review the release notes and update the exact version in your project:

```bash
npm install --save-exact --ignore-scripts premature-contribution-firewall@0.2.0
npm ls premature-contribution-firewall
npm exec --offline -- pcf --help
```

These commands upgrade an older install to the currently published release.
They do not install unreleased `main` features. For a later release, substitute
its reviewed version and rerun your saved inputs before enabling blocking gates.
When upgrading to the current-source feature set, existing contribution-lane
records also need evidence for `claimIntegrity`; previous ready states can become
review or blocked when that mandatory gate is recomputed.

An Action pin changes separately. Review the release commit, update the workflow
to that immutable SHA, and retain `fail-on: never` during evaluation. Do not assume
that upgrading npm changes an Action pin. On October 2, the public
[`rygel/outerstellar-platform` workflow](https://github.com/rygel/outerstellar-platform/blob/main/.github/workflows/pcf-pr-gate.yml)
still pinned `ee022516a5aaf134b9633322537300bb8483713c` with a `v0.1.3` comment,
read-only permissions, and `fail-on: never`. That commit predates the actual
`v0.1.3` tag at `b2bd5e4083045d69f4f5a2dab13527ae393bebfa`; the comment and
manifest version do not establish release equivalence. This is a checked
installation example, not endorsement, a usage total, or permission to change
their repository.

## Verify a candidate package from source

Clone PCF, select the reviewed commit or branch, and record its identity:

```bash
git clone https://github.com/VrtxOmega/premature-contribution-firewall.git
cd premature-contribution-firewall
git rev-parse HEAD
npm run ci:gates
npm run package:verify
```

`package:verify` packs the checkout with lifecycle scripts disabled, installs the
tarball offline into a temporary consumer directory with an isolated npm cache,
and runs the generated `pcf`, `premature-contribution-firewall`, and `pcf-mcp`
commands. It checks help, preflight exits **0/1/2**, packaged lifecycle input,
MCP initialization/tools/health/readiness/server-card, and the expected feature
contract. Fixtures come from the installed package, and the consumer working
directory contains spaces and `#`. PCF subprocess network attempts fail the check.

The JSON receipt names the platform, Node version, contract, package version,
artifact origin, and SHA-512 integrity. The temporary installation is removed.
No global install, publishing, GitHub write, or study enrollment occurs. This is
an install/command smoke check, not a security audit or complete product test.

The default `current` contract requires the unreleased capabilities. To retest
the exact released artifact instead, download it explicitly and select its
contract (the verifier itself still runs from the current checkout):

```bash
npm pack premature-contribution-firewall@0.2.0 --ignore-scripts
npm run package:verify -- --tarball ./premature-contribution-firewall-0.2.0.tgz --contract v0.2.0
```

For a future approved release containing the current features, use its exact
tarball with `--contract current`. Keep released-artifact results separate from
checkout-package results. See the [release checklist](RELEASE_CHECKLIST.md).
