# Maintainer Demo

This is the short demonstration path for showing Premature Contribution Firewall to a maintainer who is drowning in low-quality public issues and pull requests.

## Five-Minute Proof

Show the setup path first:

```bash
npm run setup:pilot -- --repository owner/repo
```

This proves the pilot is not a README scavenger hunt. The command prints the GitHub App fields, read-only permissions, webhook events, safe `.env` values, and first dry-run queue commands.

Run the deterministic demo:

```bash
npm run demo:maintainer
```

For a README-ready artifact:

```bash
npm run demo:maintainer:write
```

What this proves:

- The benchmark corpus passes.
- The adversarial red-test corpus passes.
- The maintainer queue sorts ready, repair-needed, and low-value work, then decomposes non-ready work into concrete `nextAction` buckets.
- Repository and upstream context can affect triage.
- Maintainer feedback can become a replayable candidate fixture.
- Candidate replay comparison can catch policy regressions before merge.

## Browser Walkthrough

Start the local app:

```bash
npm start
```

Open:

```text
http://127.0.0.1:3791
```

Show these surfaces:

- `GitHub App Setup`: dry-run/write posture, webhook posture, queue-history posture, and read-only connection testing.
- `Maintainer Queue`: run the demo queue and show ready, repair, low-value, context findings, repair sub-actions, review budget, and markdown export.
- `Feedback Calibration`: record a maintainer correction from a queue item, export regression candidates, and show calibration matches on later triage.
- `Feedback Candidate Corpus`: apply selected runnable candidates, replay the corpus, export evidence, capture a baseline, and compare replay.
- `API Spec`: show that the same workflow is callable without the browser.

## API Smoke Path

```bash
curl -s http://127.0.0.1:3791/api/health
curl -s http://127.0.0.1:3791/api/spec
curl -s 'http://127.0.0.1:3791/api/github/setup/guide?repository=owner/repo'
curl -s -H 'Content-Type: application/json' --data-binary @fixtures/queue-sample.json http://127.0.0.1:3791/api/github/queue
curl -s http://127.0.0.1:3791/api/feedback/calibration
curl -s http://127.0.0.1:3791/api/feedback/candidates/replay
```

## Public Shadow Pilot

Run this only in dry-run/read-only mode:

```bash
npm run pilot:public:markdown -- --repository owner/repo --limit 10 --write public-pilot.md
npm run pilot:public -- --repository owner/repo --limit 10 --capture /tmp/pcf-owner-repo-capture.json
npm run pilot:public:markdown -- --fixture /tmp/pcf-owner-repo-capture.json --write /tmp/pcf-owner-repo-replay.md
```

This artifact is for private review before approaching a maintainer. It shows the `review-now`, `send-repair-request`, and `do-not-review-yet` split, the refined `nextAction` buckets, repository-context labels, collection errors, and possible red-test leads. The replay capture is the stable input set for evaluator before/after comparisons; keep it private because it contains normalized third-party issue/PR bodies and repository-context results. For larger or repeated live pilots, set `GITHUB_TOKEN` or `GH_TOKEN` to a public-read token so GitHub search rate limits do not hide duplicate/concurrent-work context.

## What To Say

PCF does not judge whether a contribution was written by AI. It asks whether the work is reviewable: scoped, reproducible, tested, routed, aware of similar work, and respectful of maintainer attention.

The strongest demo line is:

```text
Bad work is returned with repair instructions. Good work reaches a maintainer faster. Breaks become replayable tests.
Corrections calibrate the next queue run without hiding the base score.
```

## What Not To Say

- Do not call it an AI detector.
- Do not imply public deployment is ready without auth, rate limits, webhook secret review, and storage policy.
- Do not claim the synthetic corpus proves universal real-world precision.
- Do not say feedback automatically changes the benchmark. It produces reviewed candidates first.
