import test from "node:test";
import assert from "node:assert/strict";
import { createGitHubClient } from "../src/github/client.mjs";

test("GitHub client collects a read-only maintainer queue", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname + parsed.search);
    if (parsed.pathname === "/repos/owner/repo/pulls") {
      return jsonResponse([
        {
          number: 5,
          title: "webhook: include dry-run labels",
          body: "Fixes #4.\n\nProblem: labels are omitted.\n\nVerification: npm test.",
          author_association: "CONTRIBUTOR",
          draft: false,
          labels: [],
          html_url: "https://github.example/owner/repo/pull/5",
          updated_at: "2026-05-30T00:00:00Z"
        }
      ]);
    }
    if (parsed.pathname === "/repos/owner/repo/pulls/5/files") {
      return jsonResponse([
        { filename: "src/github/templates.mjs", additions: 12, deletions: 2, patch: "+label preview" }
      ]);
    }
    if (parsed.pathname === "/repos/owner/repo/issues") {
      return jsonResponse([
        {
          number: 4,
          title: "Dry-run labels are omitted",
          body: "The dry-run response omits labels.",
          state: "open",
          labels: [{ name: "bug" }],
          html_url: "https://github.example/owner/repo/issues/4",
          updated_at: "2026-05-29T00:00:00Z"
        }
      ]);
    }
    if (parsed.pathname === "/search/issues") {
      const query = parsed.searchParams.get("q") || "";
      if (query.includes("repo:upstream/repo")) {
        return jsonResponse({
          items: [
            {
              number: 9,
              title: "webhook: include dry-run labels",
              body: "Merged upstream fix.",
              state: "closed",
              pull_request: { merged_at: "2026-05-29T01:00:00Z" },
              labels: [],
              html_url: "https://github.example/upstream/repo/pull/9"
            }
          ]
        });
      }
      return jsonResponse({
        items: [
          {
            number: 4,
            title: "Dry-run labels are omitted",
            body: "The dry-run response omits labels.",
            state: "open",
            labels: [{ name: "bug" }],
            html_url: "https://github.example/owner/repo/issues/4"
          }
        ]
      });
    }
    if (parsed.pathname === "/search/commits") {
      return jsonResponse({ items: [] });
    }
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const client = createGitHubClient({
      githubApiBase: "https://api.github.test",
      upstreamRepository: "upstream/repo",
      githubCacheTtlMs: 60_000
    });
    const queue = await client.collectRepositoryQueue({
      owner: "owner",
      repo: "repo",
      limit: 2,
      upstreamRepository: "upstream/repo"
    });

    assert.equal(queue.source, "github-api");
    assert.equal(queue.repository, "owner/repo");
    assert.equal(queue.items.length, 2);
    assert.equal(queue.items[0].kind, "pull_request");
    assert.equal(queue.items[0].files[0].filename, "src/github/templates.mjs");
    assert.equal(queue.items[0].repositoryContext.source, "github-api");
    assert.equal(queue.collectionErrors.length, 0);
    assert.ok(calls.some((call) => call.startsWith("/repos/owner/repo/pulls?")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub client uses optional read token for public API calls", async () => {
  const originalFetch = globalThis.fetch;
  let authorization = "";
  globalThis.fetch = async (url, options = {}) => {
    authorization = options.headers?.Authorization || "";
    return jsonResponse({ full_name: "owner/repo" });
  };

  try {
    const client = createGitHubClient({
      githubApiBase: "https://api.github.test",
      githubToken: "READ_TOKEN_VALUE"
    });
    const repository = await client.request("/repos/owner/repo");

    assert.equal(repository.full_name, "owner/repo");
    assert.equal(authorization, "Bearer READ_TOKEN_VALUE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub client fills issue-only queues when GitHub issue pages include PRs", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname + parsed.search);
    if (parsed.pathname === "/repos/owner/repo/issues") {
      const page = Number(parsed.searchParams.get("page") || "1");
      const perPage = Number(parsed.searchParams.get("per_page") || "25");
      if (page === 1) {
        return jsonResponse([
          ...Array.from({ length: perPage - 1 }, (_, index) => ({
            number: index + 100,
            title: `PR ${index}`,
            body: "Pull request mixed into issues endpoint.",
            pull_request: { url: "https://github.example/pull" }
          })),
          issuePayload(4)
        ]);
      }
      return jsonResponse([issuePayload(5), issuePayload(6)]);
    }
    if (parsed.pathname === "/search/issues") {
      return jsonResponse({ items: [] });
    }
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const client = createGitHubClient({
      githubApiBase: "https://api.github.test",
      githubCacheTtlMs: 0
    });
    const queue = await client.collectRepositoryQueue({
      owner: "owner",
      repo: "repo",
      limit: 3,
      includePullRequests: false,
      includeIssues: true
    });

    assert.equal(queue.items.length, 3);
    assert.deepEqual(queue.items.map((item) => item.number), [4, 5, 6]);
    assert.ok(calls.some((call) => call.includes("page=2")));
    assert.equal(calls.some((call) => call.startsWith("/repos/owner/repo/pulls")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async text() {
      return JSON.stringify(data);
    }
  };
}

function issuePayload(number) {
  return {
    number,
    title: `Issue ${number}`,
    body: "Steps to reproduce: open the dry-run queue.\nExpected: issue appears.\nActual: issue was skipped.\nEnvironment: current main.\nLogs:\n```text\nqueue missing issue\n```\nDuplicate search: searched current main.\nRoot cause: issue pages included PRs.",
    state: "open",
    labels: [{ name: "bug" }],
    html_url: `https://github.example/owner/repo/issues/${number}`,
    updated_at: "2026-05-30T00:00:00Z"
  };
}
