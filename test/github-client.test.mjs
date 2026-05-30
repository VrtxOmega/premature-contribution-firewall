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
