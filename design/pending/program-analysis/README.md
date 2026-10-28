# Program analysis and AI coach (PENDING, not in the app)

Status: **pending**. Built and tested, then held back from the live app on request (28 Oct 2026).

What it is: a Program analysis screen (Analyse on a program) with weekly working sets per muscle and day, a front and back
muscle map, coach-set targets and findings, side-by-side change previews saved only on Accept, muscles on each movement
(primary, secondary, a share per secondary muscle), two calf-raise starter movements (schema v5), and an optional AI coach
that explains the findings (needs a server endpoint; see AI_COACH in the code).

Where it is: commits 8e8f0d6, 244e732, 19c4a68 and 63cbc4f, held back by commit ed41d51.

To bring it back: `git revert ed41d51`, then `node tools/update-hashes.js` and the tests (tests/analysis.js comes back too).
Try-out copy: https://claude.ai/artifact/2CbnN3NUxPRS4jrwTXtHNm
