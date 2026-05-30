# Maintainer Demo

This is the short demonstration path for showing Premature Contribution Firewall to a maintainer who is drowning in low-quality public issues and pull requests.

## Five-Minute Proof

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
- The maintainer queue sorts ready, repair-needed, and low-value work.
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
- `Maintainer Queue`: run the demo queue and show ready, repair, low-value, context findings, review budget, and markdown export.
- `Feedback Calibration`: record a maintainer correction from a queue item, export regression candidates, and show calibration matches on later triage.
- `Feedback Candidate Corpus`: apply selected runnable candidates, replay the corpus, export evidence, capture a baseline, and compare replay.
- `API Spec`: show that the same workflow is callable without the browser.

## API Smoke Path

```bash
curl -s http://127.0.0.1:3791/api/health
curl -s http://127.0.0.1:3791/api/spec
curl -s -H 'Content-Type: application/json' --data-binary @fixtures/queue-sample.json http://127.0.0.1:3791/api/github/queue
curl -s http://127.0.0.1:3791/api/feedback/calibration
curl -s http://127.0.0.1:3791/api/feedback/candidates/replay
```

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
