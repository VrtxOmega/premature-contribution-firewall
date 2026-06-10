import test from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_CASES, renderBenchmarkMarkdown, runBenchmark } from "../src/core/benchmark.mjs";

test("benchmark corpus is broad enough to be useful", () => {
  assert.ok(BENCHMARK_CASES.length >= 70);
  const categories = new Set(BENCHMARK_CASES.map((item) => item.category));
  for (const category of ["standard-pr", "issue", "repo-policy", "repo-context", "kernel-grade", "patch-series", "tool-use", "review-budget"]) {
    assert.ok(categories.has(category), `missing category ${category}`);
  }
  const repoContextCases = BENCHMARK_CASES.filter((item) => item.category === "repo-context");
  assert.ok(repoContextCases.length >= 12, `expected at least 12 repo-context cases, got ${repoContextCases.length}`);
});

test("benchmark expectations pass deterministically", () => {
  const result = runBenchmark();
  assert.equal(result.ok, true, JSON.stringify(result.cases.filter((item) => !item.passed), null, 2));
  assert.equal(result.benchmark.failed, 0);
  assert.equal(result.benchmark.passed, result.benchmark.total);
});

test("benchmark markdown is README-ready", () => {
  const result = runBenchmark();
  const markdown = renderBenchmarkMarkdown(result);
  assert.match(markdown, /Premature Contribution Firewall Benchmark Results/);
  assert.match(markdown, /standard-ready-pr/);
  assert.match(markdown, /patch-ready-single/);
  assert.match(markdown, /\| Result \| Category \| Case \| Expected \| Actual \| Score \| Labels \|/);
});
