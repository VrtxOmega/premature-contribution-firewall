import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateReproGate } from "../src/core/repro-gate.mjs";
import { callPcfMcpTool } from "../src/mcp/core.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const before = { commands: [{ command: "test-before", exitCode: 1 }] };
const after = { commands: [{ command: "test-after", exitCode: 0 }] };
const artifacts = [{ path: "before.log", kind: "before-repro" }, { path: "after.log", kind: "after-validation" }];
const invalidError = { name: "TypeError", code: "PCF_INVALID_REPRO_EXIT_CODE" };

for (const [label, exitCode] of [
  ["false", false], ["true", true], ["fraction", 0.5], ["negative fraction", -0.5],
  ["numeric string", "0"], ["empty string", ""], ["whitespace", " "],
  ["empty array", []], ["singleton array", [0]], ["object", {}],
  ["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity], ["bigint", 0n]
]) {
  test(`repro gate rejects ${label} exit codes before verdicts or artifacts can mask them`, () => {
    for (const phase of ["before", "after"]) {
      const input = {
        before, after, artifacts,
        [phase]: {
          verdict: phase === "before" ? "before-fails" : "passed",
          commands: [{ command: `test-${phase}`, exitCode, outputPath: `${phase}.log` }]
        }
      };
      assert.throws(() => evaluateReproGate(input), invalidError, phase);
    }
  });
}

test("repro gate does not invoke numeric coercion on command evidence", () => {
  const exitCode = { valueOf() { assert.fail("Input valueOf must not run"); } };
  assert.throws(() => evaluateReproGate({ before, after: { commands: [{ command: "test", exitCode }] } }), invalidError);
});

for (const [label, build] of [
  ["baseline singular command", command => ({ baseline: { verdict: "before-fails", command }, after, artifacts })],
  ["validation singular command", command => ({ before, validation: { verdict: "passed", command }, artifacts })],
  ...["before", "after", "validation", "unrecognized", ""].map(phase => [
    `top-level phase ${phase || "omitted"}`, command => ({ before, after, commands: [{ ...command, phase }] })
  ]),
  ["pathless record", command => ({ before, after: { verdict: "passed", commands: [{ exitCode: command.exitCode }] }, artifacts })],
  ["successful sibling", command => ({ before, after: { commands: [after.commands[0], command] } })]
]) {
  test(`repro gate rejects malformed exit codes in ${label}`, () => {
    for (const exitCode of [false, 0.5]) {
      assert.throws(() => evaluateReproGate(build({ command: "test", exitCode })), invalidError);
    }
  });
}

test("repro gate validates selected code/status aliases and preserves nullish precedence", () => {
  for (const key of ["code", "status"]) {
    for (const value of [false, 0.5, "0"]) {
      assert.throws(() => evaluateReproGate({ before, after: { commands: [{ command: "test", exitCode: null, [key]: value }] } }), invalidError);
    }
    assert.equal(evaluateReproGate({ before, after: { commands: [{ command: "test", [key]: 0 }] } }).status, "pass");
  }
  for (const command of [
    { command: "test", exitCode: 0, code: false, status: "ignored" },
    { command: "test", exitCode: null, code: 0, status: false },
    { command: "test", exitCode: null, code: null, status: 0 }
  ]) {
    assert.equal(evaluateReproGate({ before, after: { commands: [command] } }).status, "pass");
  }
});

test("repro gate preserves integer exit codes without imposing a process-specific range", () => {
  for (const exitCode of [0, -0, 1, -1, 255, 1024, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) {
    const result = evaluateReproGate({ before, after: { commands: [{ command: "test", exitCode }] } });
    assert.equal(result.status, exitCode === 0 ? "pass" : "blocked");
    assert.equal(result.evidence.after.commands[0].exitCode, exitCode);
    if (exitCode !== 0) {
      assert.equal(evaluateReproGate({ before: { commands: [{ command: "test", exitCode }] }, after }).status, "pass");
    }
  }
});

test("repro gate preserves missing/null exit codes as unknown and valid artifact-backed verdicts", () => {
  for (const command of [{ command: "test" }, { command: "test", exitCode: null }, "test"]) {
    const result = evaluateReproGate({ before, after: { commands: [command] } });
    assert.equal(result.status, "review");
    assert.equal(result.evidence.after.commands[0].exitCode, null);
  }
  const result = evaluateReproGate({
    before: { verdict: "before-fails", commands: [{ command: "test", exitCode: null }] },
    after: { verdict: "passed" }, artifacts
  });
  assert.equal(result.status, "pass");
});

test("MCP tool dispatch rejects invalid exit codes and retains valid gate decisions", async () => {
  for (const exitCode of [false, 0.5]) {
    await assert.rejects(callPcfMcpTool("pcf_repro_gate", { before, after: { commands: [{ command: "test", exitCode }] } }), invalidError);
  }
  for (const [exitCode, status] of [[0, "pass"], [1, "blocked"], [null, "review"]]) {
    const result = await callPcfMcpTool("pcf_repro_gate", { before, after: { commands: [{ command: "test", exitCode }] } });
    assert.equal(result.status, status);
  }
});

for (const mode of ["line", "header"]) {
  test(`MCP ${mode} stdio returns tool errors for invalid exit codes and serves following valid requests`, () => {
    const inputs = [false, 0.5, 0, 1, null];
    const input = inputs.map((exitCode, id) => {
      const body = JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: {
        name: "pcf_repro_gate", arguments: { before, after: { commands: [{ command: "test", exitCode }] } }
      } });
      return mode === "line" ? `${body}\n` : `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    }).join("");
    const child = spawnSync(process.execPath, ["src/mcp/server.mjs"], { cwd: repoRoot, input, encoding: "utf8", timeout: 10_000 });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stderr, "");
    const replies = decodeReplies(child.stdout, mode);
    assert.deepEqual(replies.map(reply => reply.id), [0, 1, 2, 3, 4]);
    for (const reply of replies.slice(0, 2)) {
      assert.equal(reply.result.isError, true);
      const diagnostic = JSON.parse(reply.result.content[0].text);
      assert.equal(diagnostic.ok, false);
      assert.match(diagnostic.error, /Invalid repro command exit code/);
      assert.equal(Object.hasOwn(diagnostic, "gate"), false);
    }
    assert.deepEqual(replies.slice(2).map(reply => JSON.parse(reply.result.content[0].text).status), ["pass", "blocked", "review"]);
  });
}

function decodeReplies(stdout, mode) {
  if (mode === "line") return stdout.trim().split("\n").map(line => JSON.parse(line));
  const replies = [];
  let remaining = Buffer.from(stdout);
  while (remaining.length) {
    const separator = remaining.indexOf("\r\n\r\n");
    assert.notEqual(separator, -1);
    const match = /^Content-Length: (\d+)$/.exec(remaining.subarray(0, separator).toString("ascii"));
    assert.ok(match);
    const end = separator + 4 + Number(match[1]);
    assert.ok(end <= remaining.length);
    replies.push(JSON.parse(remaining.subarray(separator + 4, end).toString("utf8")));
    remaining = remaining.subarray(end);
  }
  return replies;
}
