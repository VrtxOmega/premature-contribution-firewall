import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyInstalledPackage, withInstalledPackage } from "../scripts/verify-package-install.mjs";

test("packed commands work outside the checkout and reject broken installed surfaces", async (t) => {
  await withInstalledPackage({}, async (consumerRoot) => {
    const installed = join(consumerRoot, "node_modules", "premature-contribution-firewall");
    await t.test("real packed CLI aliases, verdict exits, lifecycle and MCP pass", async () => {
      assert.equal((await verifyInstalledPackage(consumerRoot)).ok, true);
    });
    await t.test("unreleased code cannot masquerade as the v0.2.0 contract", async () => {
      await assert.rejects(() => verifyInstalledPackage(consumerRoot, { contract: "v0.2.0" }), assert.AssertionError);
    });
    await t.test("a missing packaged MCP document fails even when the checkout has it", async () => {
      const document = join(installed, "docs", "MCP.md");
      await rename(document, `${document}.saved`);
      try {
        await assert.rejects(() => verifyInstalledPackage(consumerRoot), /Installed MCP readiness/);
      } finally {
        await rename(`${document}.saved`, document);
      }
    });
    await t.test("an exit-zero CLI with no output does not pass", async () => {
      const cli = join(installed, "src", "cli.mjs");
      const original = await readFile(cli);
      try {
        await writeFile(cli, "#!/usr/bin/env node\nprocess.exit(0);\n");
        await assert.rejects(() => verifyInstalledPackage(consumerRoot), assert.AssertionError);
      } finally {
        await writeFile(cli, original);
      }
    });
    await t.test("a missing installed alias fails even when the primary command works", async () => {
      const alias = join(consumerRoot, "node_modules", ".bin", `premature-contribution-firewall${process.platform === "win32" ? ".cmd" : ""}`);
      await rename(alias, `${alias}.saved`);
      try {
        await assert.rejects(() => verifyInstalledPackage(consumerRoot), assert.AssertionError);
      } finally {
        await rename(`${alias}.saved`, alias);
      }
    });
  });
});
