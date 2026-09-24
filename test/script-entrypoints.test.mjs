import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourceRoot = fileURLToPath(new URL("..", import.meta.url));
const scripts = ["public-pilot", "serious-scout", "watchlist", "large-bench"];
let sandbox;
let root;
let cwd;
let env;

before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "pcf cli # % "));
  root = join(sandbox, "project");
  cwd = join(sandbox, "elsewhere");
  await mkdir(root);
  await mkdir(cwd);
  for (const name of ["src", "scripts"]) {
    await cp(join(sourceRoot, name), join(root, name), { recursive: true });
  }
  await writeFile(join(root, ".env"), "PCF_CLI_ROOT_SENTINEL=module-root\n");
  await writeFile(join(cwd, ".env"), "PCF_CLI_ROOT_SENTINEL=wrong-working-directory\n");
  await writeFile(join(cwd, "queue.json"), JSON.stringify({ repository: "owner/repo", items: [] }));
  await writeFile(join(cwd, "issues.json"), "[]");
  await mkdir(join(cwd, "config"));
  await writeFile(join(cwd, "config", "watchlist.json"), JSON.stringify({
    repositories: [{ repository: "owner/repo", fixture: "../queue.json" }]
  }));
  await mkdir(join(cwd, "captures"));
  await cp(join(cwd, "queue.json"), join(cwd, "captures", "owner__repo.capture.json"));
  // Fixture tests must never fall through to live collection.
  await writeFile(join(sandbox, "offline.mjs"), `
    import { writeFileSync } from 'node:fs';
    globalThis.fetch = () => {
      writeFileSync(process.env.PCF_TEST_FETCH_MARKER, 'attempted');
      throw new Error('Unexpected network request');
    };
  `);
  env = { ...process.env };
  delete env.PCF_CLI_ROOT_SENTINEL;
});

after(async () => {
  if (sandbox) await rm(sandbox, { recursive: true, force: true });
});

async function run(args) {
  const marker = join(sandbox, `fetch-${randomUUID()}`);
  try {
    return await execFileAsync(process.execPath, ["--import", pathToFileURL(join(sandbox, "offline.mjs")).href, ...args], {
      cwd, env: { ...env, PCF_TEST_FETCH_MARKER: marker }, timeout: 15_000
    });
  } finally {
    assert.equal(existsSync(marker), false, "Unexpected network attempt");
  }
}

test("offline guard detects collection attempts even if the caller catches the error", async () => {
  await assert.rejects(run(["--input-type=module", "--eval", `
    try { await fetch('https://example.invalid/'); } catch {}
  `]), /Unexpected network attempt/);
});

const cases = [
  {
    name: "public-pilot", args: ["--fixture", "queue.json"],
    verify(report) { assert.equal(report.repository, "owner/repo"); assert.equal(report.breakdown.total, 0); }
  },
  {
    name: "serious-scout", args: ["--fixture", "issues.json"],
    verify(report) { assert.equal(report.artifact, "pcf-serious-candidate-scout"); assert.equal(report.summary.total, 0); }
  },
  {
    name: "watchlist", args: ["--config", "config/watchlist.json"],
    verify(report) { assert.equal(report.artifact, "pcf-watchlist-report"); assert.equal(report.summary.scanned, 1); }
  },
  {
    name: "large-bench", args: ["--from-captures", "--targets", "owner/repo", "--capture-dir", "captures"],
    verify(report) { assert.equal(report.repositories.length, 1); assert.equal(report.repositories[0].repository, "owner/repo"); }
  }
];

for (const { name, args, verify } of cases) {
  test(`${name} CLI runs from an escaped path and another working directory`, async () => {
    const output = `${name} output # %.json`;
    const { stdout, stderr } = await run([
      join(root, "scripts", `run-${name}.mjs`), ...args, "--format", "json", "--write", output
    ]);
    assert.match(stdout, /Wrote/);
    assert.equal(stderr, "");
    verify(JSON.parse(await readFile(join(cwd, output), "utf8")));
  });

  test(`${name} CLI preserves invalid-format failures`, async () => {
    await assert.rejects(run([
      join(root, "scripts", `run-${name}.mjs`), ...args, "--format", "invalid-format"
    ]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Unsupported format/);
      return true;
    });
  });
}

test("importing all four scripts without argv[1] does not run a CLI or load .env", async () => {
  const beforeFiles = await readdir(cwd, { recursive: true });
  const urls = scripts.map((name) => pathToFileURL(join(root, "scripts", `run-${name}.mjs`)).href);
  const { stdout, stderr } = await run(["--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    assert.equal(process.argv[1], undefined);
    for (const url of ${JSON.stringify(urls)}) {
      const mod = await import(url);
      assert.ok(Object.values(mod).some(value => typeof value === 'function'));
    }
    assert.equal(process.env.PCF_CLI_ROOT_SENTINEL, undefined);
    console.log('import-only');
  `]);
  assert.equal(stdout.trim(), "import-only");
  assert.equal(stderr, "");
  assert.deepEqual(await readdir(cwd, { recursive: true }), beforeFiles);
});

for (const [name, exported, fixture] of [
  ["public-pilot", "buildPublicPilotReport", "queue.json"],
  ["serious-scout", "runSeriousScout", "issues.json"]
]) {
  test(`${name} loads default configuration from its module root`, async () => {
    const url = pathToFileURL(join(root, "scripts", `run-${name}.mjs`)).href;
    const { stdout, stderr } = await run(["--input-type=module", "--eval", `
      import assert from 'node:assert/strict';
      const mod = await import(${JSON.stringify(url)});
      assert.equal(process.env.PCF_CLI_ROOT_SENTINEL, undefined);
      await mod.${exported}({ fixturePath: ${JSON.stringify(fixture)} });
      assert.equal(process.env.PCF_CLI_ROOT_SENTINEL, 'module-root');
      console.log('root-loaded');
    `]);
    assert.equal(stdout.trim(), "root-loaded");
    assert.equal(stderr, "");
  });
}
