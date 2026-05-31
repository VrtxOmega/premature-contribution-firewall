import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateContribution, renderMarkdownReport } from "../src/core/evaluator.mjs";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));
}

test("unready pull request is blocked before maintainer review", async () => {
  const result = evaluateContribution(await fixture("pr-unready"));
  assert.equal(result.kind, "pull_request");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.score < 50);
  assert.ok(result.labels.includes("too-broad"));
  assert.ok(result.labels.includes("needs-tests"));
  assert.ok(result.labels.includes("secrets-risk"));
  assert.ok(result.repairSteps.some((step) => step.includes("Split unrelated work")));
});

test("ready pull request passes as reviewable", async () => {
  const result = evaluateContribution(await fixture("pr-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.blockers.length, 0);
  assert.ok(result.strengths.some((item) => item.includes("test")));
  assert.equal(result.profile.id, "standard");
  assert.ok(result.reviewBudget.minutes > 0);
});

test("unready issue requires reproducer and real evidence", async () => {
  const result = evaluateContribution(await fixture("issue-unready"));
  assert.equal(result.kind, "issue");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-reproducer"));
  assert.ok(result.labels.includes("needs-real-evidence"));
  assert.ok(result.blockers.some((check) => check.id === "reproducer"));
});

test("ready issue has enough evidence for maintainer attention", async () => {
  const result = evaluateContribution(await fixture("issue-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.ok(result.labels.includes("ready-for-maintainer"));
});

test("device support report with logs and repository context is reviewable", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Request support for Meaco Sefte Pro Fan",
    labels: [{ name: "new device" }, { name: "log provided" }],
    body: [
      "### Log message",
      "",
      "```text",
      "Device matches meaco_seftepro_fan with quality of 101%.",
      "LOCAL DPS: {\"1\": true, \"2\": \"Normal\", \"3\": 1}",
      "```",
      "",
      "### Product ID",
      "",
      "hf57kaednmtjbynq",
      "",
      "### Product Name",
      "",
      "Meaco Sefte Pro",
      "",
      "### DPS information",
      "",
      "```text",
      "name: Meaco Sefte Pro Fan",
      "products:",
      "  - id: hf57kaednmtjbynq",
      "entities:",
      "  - entity: fan",
      "```"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "make-all/tuya-local",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.labels.includes("needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.equal(result.labels.includes("duplicate-search-needed"), false);
  assert.ok(result.strengths.some((item) => item.includes("device identity")));
});

test("complete feature request is evaluated as a feature request, not a bug report", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Notion Integration",
    labels: [{ name: "enhancement" }],
    body: [
      "### Describe the feature you'd like to request",
      "",
      "I’d like floccus to support direct syncing with Notion, so bookmarks can be pushed/pulled to Notion databases without using an intermediate service.",
      "Current workflow: I sync bookmarks from floccus to Linkwarden, then pull them into Notion. This adds complexity and an extra point of failure.",
      "Use case: keep a central, searchable Notion database of bookmarks with tags, notes, and original metadata.",
      "",
      "### Describe the solution you'd like",
      "",
      "Add a Notion connector that authenticates with Notion, lets users choose a target database, maps bookmark fields to Notion properties, supports incremental sync, and respects rate limits.",
      "",
      "### Describe alternatives you've considered",
      "",
      "- Continue using Linkwarden as an intermediary.",
      "- Export/import bookmarks manually into Notion.",
      "- Use a dedicated bookmarking service with native Notion support."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "floccusaddon/floccus",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.labels.includes("needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.ok(result.checks.some((check) => check.id === "feature-use-case" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "feature-solution" && check.status === "pass"));
  assert.ok(result.strengths.some((item) => item.includes("feature use case")));
});

test("thin feature request still needs repair before maintainer review", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Dark mode",
    labels: [{ name: "enhancement" }],
    body: "Please add dark mode."
  });

  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-use-case"));
  assert.ok(result.blockers.some((check) => check.id === "feature-use-case"));
});

test("feature request with problem and requested behavior does not require alternatives", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Add the ability to have TrackLink inserted by default",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I am frustrated when I forget to click the TrackLink checkbox before sending the campaign.",
      "",
      "**Describe the solution you'd like**",
      "I would like a setting that automatically enables TrackLink for pasted links."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "knadh/listmonk",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-feature-scope"), false);
  assert.ok(result.checks.some((check) => check.id === "feature-scope" && check.status === "pass"));
});

test("feature request with current workflow and expected behavior counts as use-case evidence", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Feature request: Select Subscription Status(es) on List export",
    labels: [{ name: "enhancement" }],
    body: [
      "When I use a single opt-in list, I expect emails to be sent to subscribers with both the confirmed and unconfirmed status.",
      "Currently, the default export contains all subscribers regardless of subscription status.",
      "I would like to select which statuses should be exported when clicking Export in the default List Subscribers overview.",
      "For double opt-in lists, I can already see only the confirmed subscriptions and export those."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "knadh/listmonk",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.checks.some((check) => check.id === "feature-use-case" && check.status === "pass"));
  assert.equal(result.labels.includes("needs-use-case"), false);
});

test("concise protocol support title can be clear enough for triage", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Support SSO",
    labels: [{ name: "enhancement" }],
    body: [
      "**Is your feature request related to a problem? Please describe.**",
      "I am trying to implement SSO on my homelab, but the Android app does not support the Jellyfin SSO plugin.",
      "",
      "**Describe the solution you'd like**",
      "Support the SSO login flow used by the Jellyfin plugin so users can authenticate without falling back to password-only app login.",
      "",
      "**Describe alternatives you've considered**",
      "Quick Connect works as a workaround, but it does not provide the same SSO policy coverage.",
      "",
      "**Additional context**",
      "The browser flow works today with the same server."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "jarnedemeulemeester/findroid",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-clear-summary"), false);
  assert.ok(result.checks.some((check) => check.id === "title" && check.status === "pass"));
});

test("security monitoring feature request is not treated as a vulnerability report", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "[Feature]: Add SSL certificate expiry and SNMP monitoring",
    labels: [{ name: "enhancement" }],
    body: [
      "### Welcome!",
      "",
      "- [x] I have searched open and closed feature requests.",
      "- [x] This is a feature request, not a bug report or support question.",
      "",
      "### Component",
      "",
      "Hub",
      "",
      "### Description",
      "",
      "I propose adding SSL certificate expiry monitoring and SNMP device monitoring to improve system observability.",
      "The SSL monitor should allow target domains or IPs, alert thresholds, and notifications before certificates expire.",
      "The SNMP monitor should support v2c and v3, connection details, authentication settings, and custom metric OIDs.",
      "",
      "### Motivation / Use Case",
      "",
      "This would help prevent service outages caused by certificate expiration and would let a homelab monitor switches and routers from the same dashboard."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "henrygd/beszel",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("ready-for-maintainer"));
  assert.equal(result.labels.includes("security-claim-needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.ok(result.checks.some((check) => check.id === "feature-use-case" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "feature-solution" && check.status === "pass"));
});

test("complete structured Android media bug template is reviewable without pasted logs", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Trickplay doesn't load from where the content started playing",
    labels: [{ name: "bug" }],
    body: [
      "### Describe your issue",
      "",
      "If you start a movie or episode in the middle, it will not load trickplay. It only loads if playback starts at the beginning.",
      "",
      "### Steps to reproduce",
      "",
      "1. Play an episode from the middle.",
      "2. Try to initiate swipe to trickplay or seek to trickplay.",
      "3. Observe that trickplay does not work.",
      "",
      "### Expected behavior",
      "",
      "Trickplay is loaded from where playback starts, and seeking should not start trickplay until it is loaded.",
      "",
      "### Screenshots",
      "",
      "_No response_",
      "",
      "### Player",
      "",
      "mpv",
      "",
      "### Additional context",
      "",
      "_No response_",
      "",
      "### Device",
      "",
      "Galaxy S25",
      "",
      "### Android version",
      "",
      "16",
      "",
      "### App version",
      "",
      "1.0.2",
      "",
      "### Jellyfin version",
      "",
      "10.11.8"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "jarnedemeulemeester/findroid",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.equal(result.labels.includes("needs-technical-analysis"), false);
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.ok(result.strengths.some((item) => item.includes("bug template")));
});

test("bug template with numbered steps inside description is reviewable", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "[Bug]: 'Minimize to Tray' does not work with Wayland",
    labels: [{ name: "bug" }, { name: "B: usability" }],
    body: [
      "### Guidelines",
      "",
      "- [x] I have encountered this bug in the latest release.",
      "- [x] I have encountered this bug in the official downloads.",
      "- [x] I have searched the issue tracker for open and closed issues.",
      "- [x] I have searched the documentation.",
      "- [x] This issue contains only one bug.",
      "",
      "### Describe the bug",
      "",
      "1. Enable \"Minimize to system tray\" setting.",
      "2. Minimize window.",
      "3. The window is not minimized to tray.",
      "",
      "### Expected Behavior",
      "",
      "Window should be minimized to tray.",
      "",
      "### Issue Labels",
      "",
      "usability issue",
      "",
      "### FreeTube Version",
      "",
      "v0.24.0-beta",
      "",
      "### Operating System Version",
      "",
      "Bazzite 44 NVIDIA Edition (Wayland)",
      "",
      "### Installation Method",
      "",
      "Flathub",
      "",
      "### Primary API used",
      "",
      "Local API",
      "",
      "### Additional Information",
      "",
      "If I add --ozone-platform=x11 to FreeTube's Electron args, the minimize event is correctly triggered and the tray icon works."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "FreeTubeApp/FreeTube",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.equal(result.labels.includes("needs-technical-analysis"), false);
  assert.ok(result.checks.some((check) => check.id === "reproducer" && check.status === "pass"));
});

test("reproduced maintainer label can route a confirmed bug without soft prompts", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "[Bug]: Proxy-settings do not work at launch of FreeTube",
    labels: [{ name: "bug" }, { name: "U: reproduced" }],
    body: [
      "### Describe the bug",
      "",
      "The proxy works during the current session, but after closing and launching FreeTube again the existing proxy settings are ignored.",
      "",
      "### Expected Behavior",
      "",
      "FreeTube should use the configured proxy at launch.",
      "",
      "### FreeTube Version",
      "",
      "v0.21.3 Beta",
      "",
      "### Operating System Version",
      "",
      "Windows 11 Pro 23H2",
      "",
      "### Installation Method",
      "",
      "Chocolatey",
      "",
      "### Primary API used",
      "",
      "Local API"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "FreeTubeApp/FreeTube",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("maintainer-approved"));
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.equal(result.repairSteps.some((step) => /logs|root-cause|reproduce/i.test(step)), false);
});

test("project-specific documented bug headings count as structured evidence", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Videos: VAAPI transcoding not working in latest release",
    labels: [{ name: "video" }],
    body: [
      "### What is not working as documented?",
      "",
      "After updating to the latest Docker image, VAAPI encode on Haswell no longer works.",
      "The FFmpeg command aborts with `A hardware device reference is required to upload frames to.` and PhotoPrism falls back to software encoding.",
      "",
      "### How can we reproduce it?",
      "",
      "Use the Docker container on a host with a GPU that supports VAAPI encode (not sure if this only occurs with Intel; the error seems generic).",
      "",
      "### What behavior do you expect?",
      "",
      "VAAPI hardware accelerated transcoding should work.",
      "",
      "### What could be the cause?",
      "",
      "FFmpeg was updated to 8.x in this release.",
      "",
      "### Which software versions do you use?",
      "",
      "- PhotoPrism Edition & Version (Build): May 2026 release, Docker AMD64",
      "",
      "### On what device is PhotoPrism installed?",
      "",
      "Intel i5 4590T",
      "",
      "### Logs, Sample Files, or Screenshots",
      "",
      "[log.txt](https://example.invalid/log.txt)"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "photoprism/photoprism",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.equal(result.labels.includes("needs-logs"), false);
  assert.ok(result.checks.some((check) => check.id === "reproducer" && check.status === "pass"));
});

test("structured bug template with uncertain reproduction still needs repair", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Skipping EP",
    labels: [{ name: "bug" }],
    body: [
      "### Describe your issue",
      "",
      "The app sometimes skips episodes and reports that details do not match the play item.",
      "",
      "### Steps to reproduce",
      "",
      "I don't know how to reproduce this. It may happen after switching apps and coming back.",
      "",
      "### Expected behavior",
      "",
      "The app should not skip from one episode to another unexpectedly.",
      "",
      "### Player",
      "",
      "mpv",
      "",
      "### Device",
      "",
      "A71",
      "",
      "### Android version",
      "",
      "13",
      "",
      "### App version",
      "",
      "1.0.2",
      "",
      "### Jellyfin version",
      "",
      "10.10.7"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "jarnedemeulemeester/findroid",
      issues: [],
      pullRequests: []
    }
  });

  assert.notEqual(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("needs-reproducer"));
  assert.ok(result.blockers.some((check) => check.id === "reproducer"));
});

test("bug template with expected behavior and concrete failure output satisfies behavior evidence", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Android app can no longer connect to my self-hosted instance",
    labels: [{ name: "bug" }, { name: "status/untriaged" }],
    body: [
      "### Describe the Bug",
      "For the last couple of weeks my Android app has not been able to hoard links. Prior to that it worked just fine.",
      "The app fails to connect even though the same phone can open the instance URL in a browser.",
      "```",
      "Network connection failed: Failed to connect to https://example.invalid:443",
      "```",
      "### Steps to Reproduce",
      "Open Android app, provide self-hosted URL, copy in API key, then attempt to connect.",
      "### Expected Behaviour",
      "I should be able to connect to my instance from the app because my phone can connect to it via its browser.",
      "### Device Details",
      "Android 16 on Pixel 10",
      "### Exact Karakeep Version",
      "Latest version installed from Google Play store",
      "### Environment Details",
      "Docker on Debian behind Traefik.",
      "### Have you checked the troubleshooting guide?",
      "- [x] I have checked the troubleshooting guide and I haven't found a solution to my problem"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.ok(result.checks.some((check) => check.id === "expected-actual" && check.status === "pass"));
});

test("approved maintainer label can route accepted issue without soft repair prompts", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Crawler: BROWSER_WEB_URL fails on IPv6-enabled Docker networks",
    labels: [{ name: "bug" }, { name: "status/approved" }],
    body: [
      "**Summary**",
      "When running on an IPv6-enabled Docker network, BROWSER_WEB_URL=http://chrome:9222 reports Chrome as Disconnected with HTTP 500 even though Chrome is healthy and reachable via IPv4.",
      "**Root Cause**",
      "The code resolves chrome to an IPv6 address and assigns it to URL.hostname without brackets, so the URL stays http://chrome:9222/.",
      "```js",
      "const u = new URL('http://chrome:9222');",
      "u.hostname = 'fd3a:d485:7e1d:e::3';",
      "console.log(u.toString());",
      "```",
      "Steps to Reproduce",
      "1. Run karakeep with an IPv6-enabled Docker network.",
      "2. Set BROWSER_WEB_URL=http://chrome:9222.",
      "3. Observe the crawler reporting Chrome as disconnected.",
      "Environment",
      "- Docker network with IPv6 enabled",
      "- Chrome remote debugging bound to IPv4"
    ].join("\n")
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("maintainer-approved"));
  assert.equal(result.labels.includes("duplicate-search-needed"), false);
  assert.equal(result.labels.includes("needs-repair"), false);
  assert.equal(result.repairSteps.some((step) => /duplicate/i.test(step)), false);
});

test("LLM product feature request is not treated as an AI-generated report", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Feature Request: Allow configuring reasoning behavior for LLM calls",
    labels: [{ name: "feature request" }, { name: "status/approved" }],
    body: [
      "### Describe the feature you'd like",
      "Karakeep currently does not provide a way to control reasoning behavior when making LLM calls.",
      "When using reasoning-capable models with structured JSON output, the model can consume all tokens on reasoning and return content: null.",
      "Example real trace: prompt_tokens: 2244, completion_tokens: 2048, content: null, reasoning_content: present.",
      "Proposed solution: allow users to configure reasoning behavior with parameters such as reasoning effort none.",
      "### Describe the benefits this would bring to existing Karakeep users",
      "This improves reliability, performance, and compatibility for local and hosted model integrations.",
      "### Can the goal of this request already be achieved via other means?",
      "A LiteLLM proxy may be able to work around this for one virtual key.",
      "### Have you searched for an existing open/closed issue?",
      "- [x] I have searched for existing issues and none cover my fundamental request"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.labels.includes("needs-real-evidence"), false);
  assert.ok(result.labels.includes("maintainer-approved"));
});

test("icebox maintainer label routes accepted backlog item out of the active repair queue", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Automatically hoard websites that get visited",
    labels: [{ name: "feature request" }, { name: "status/icebox" }],
    body: [
      "### Describe the feature you'd like",
      "I propose an opt-in browser extension setting that automatically snapshots a website once visited.",
      "### Describe the benefits this would bring to existing Karakeep users",
      "People often try to find a site they visited years ago but forgot the title for. With Karakeep search and AI features, a browser-history-style snapshot can make that possible.",
      "### Can the goal of this request already be achieved via other means?",
      "There is no browser extension setting that automatically hoards visited websites.",
      "### Have you searched for an existing open/closed issue?",
      "- [x] I have searched for existing issues and none cover my fundamental request"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("maintainer-backlog"));
  assert.equal(result.labels.includes("needs-real-evidence"), false);
  assert.equal(result.labels.includes("needs-feature-solution"), false);
  assert.equal(result.repairSteps.some((step) => /feature|tool-only|reproducible/i.test(step)), false);
});

test("pending clarification label prevents an issue from re-entering review-now", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Inference: Error: 400 url field must be a base64 encoded image",
    labels: [{ name: "bug" }, { name: "status/pending_clarification" }],
    body: [
      "### Describe the Bug",
      "When adding some images, inference returns a 400 error.",
      "```",
      "Error: 400 url field must be a base64 encoded image",
      "```",
      "### Steps to Reproduce",
      "Add https://example.invalid/image.webp and wait for inference.",
      "### Expected Behaviour",
      "The image should be processed for tagging.",
      "### Actual Behaviour",
      "Inference fails with a 400 error.",
      "### Exact Karakeep Version",
      "0.25.0",
      "### Environment Details",
      "LM Studio with a local model.",
      "### Debug Logs",
      "```text",
      "content: null",
      "finish_reason: length",
      "```"
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "karakeep-app/karakeep",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "needs-repair");
  assert.ok(result.labels.includes("maintainer-pending-clarification"));
  assert.equal(result.labels.includes("ready-for-maintainer"), false);
});

test("maintainer-authored issue routes to review-now without contributor repair prompts", () => {
  const result = evaluateContribution({
    kind: "issue",
    title: "Some users do not restart accessibility service after it is killed by the system",
    authorAssociation: "COLLABORATOR",
    labels: [{ name: "user experience" }, { name: "needs triage" }],
    body: [
      "A user in Discord would tap Proceed and then close the online guide. This does not restart the accessibility service.",
      "It is possible restart suggests it will reboot the device, causing users to avoid that option.",
      "The current online guide is ineffective for users who are unlikely to read the full guide or follow outdated steps.",
      "More aggressive service restarting might have better results."
    ].join("\n"),
    repositoryContext: {
      source: "github-api",
      repository: "keymapperorg/KeyMapper",
      issues: [],
      pullRequests: []
    }
  });

  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("maintainer-authored"));
  assert.equal(result.labels.includes("needs-reproducer"), false);
  assert.equal(result.labels.includes("needs-expected-actual"), false);
  assert.equal(result.repairSteps.some((step) => /reproduce|logs|version|expected/i.test(step)), false);
});

test("maintainer-authored issue does not override repository context conflicts", () => {
  const result = evaluateContribution({
    kind: "issue",
    number: 77,
    title: "Improve export flow",
    authorAssociation: "COLLABORATOR",
    labels: [{ name: "enhancement" }],
    body: "Developer TODO: update the export flow so users can recover from a failed file picker.",
    repositoryContext: {
      source: "github-api",
      repository: "keymapperorg/KeyMapper",
      issues: [
        {
          number: 70,
          title: "Improve export flow",
          body: "Existing open issue for the same export flow work.",
          state: "open",
          labels: ["enhancement"],
          htmlUrl: "https://github.example/issues/70"
        }
      ],
      pullRequests: []
    }
  });

  assert.notEqual(result.status, "ready-for-maintainer");
  assert.ok(result.labels.includes("maintainer-authored"));
  assert.ok(result.labels.includes("possibly-duplicate"));
  assert.equal(result.labels.includes("ready-for-maintainer"), false);
});

test("markdown report includes status, labels, repairs, and marker", async () => {
  const result = evaluateContribution(await fixture("pr-ready"));
  const markdown = renderMarkdownReport(result);
  assert.match(markdown, /Premature Contribution Firewall Review Readiness/);
  assert.match(markdown, /Profile:/);
  assert.match(markdown, /Review budget:/);
  assert.match(markdown, /ready-for-maintainer/);
  assert.match(markdown, /Repair Checklist/);
  assert.match(markdown, /<!-- premature-contribution-firewall-review -->/);
});

test("kernel-grade ready patch passes strict maintainer profile", async () => {
  const result = evaluateContribution(await fixture("pr-kernel-ready"));
  assert.equal(result.profile.id, "kernel-grade");
  assert.equal(result.status, "ready-for-maintainer");
  assert.ok(result.score >= 80);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.provenance.signedOff, true);
  assert.ok(result.checks.some((check) => check.id === "dco-signoff" && check.status === "pass"));
  assert.ok(result.checks.some((check) => check.id === "kernel-build-evidence" && check.status === "pass"));
});

test("kernel-grade unready patch blocks before maintainer attention", async () => {
  const result = evaluateContribution(await fixture("pr-kernel-unready"));
  assert.equal(result.profile.id, "kernel-grade");
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("needs-dco-signoff"));
  assert.ok(result.labels.includes("needs-tool-provenance"));
  assert.ok(result.labels.includes("review-budget-high"));
  assert.ok(result.blockers.some((check) => check.id === "dco-signoff"));
});

test("repository policy files make ready submissions easier to route", async () => {
  const result = evaluateContribution(await fixture("pr-policy-ready"));
  assert.equal(result.status, "ready-for-maintainer");
  assert.equal(result.policyProfile.hasPolicy, true);
  assert.ok(result.policyProfile.sources.some((source) => source.type === "codeowners"));
  assert.ok(result.policyProfile.testCommands.includes("npm test"));
  assert.ok(result.policyProfile.ownerMatches.some((match) => match.owners.includes("@maintainers/core")));
  assert.ok(result.checks.some((check) => check.id === "project-test-command" && check.status === "pass"));
});

test("repository policy files block submissions that ignore local rules", async () => {
  const result = evaluateContribution(await fixture("pr-policy-unready"));
  assert.equal(result.status, "low-review-value");
  assert.ok(result.labels.includes("policy-failed"));
  assert.ok(result.labels.includes("needs-project-test-command"));
  assert.ok(result.checks.some((check) => check.id === "policy" && check.status === "fail"));
  assert.ok(result.checks.some((check) => check.id === "project-test-command" && check.status === "fail"));
});
