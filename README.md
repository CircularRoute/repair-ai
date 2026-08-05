# Repair AI

Design-partner intelligence system for the appliance repair vertical. One Node
service, SQLite on a persistent disk, three server-side agents (Otto, Bob, Mark).
The spec is `repair_ai_project_spec_20260805.md`; builder rules are in `CLAUDE.md`;
founder rulings accumulate in `decisions.md`.

## Run locally

Keys live in ONE env file OUTSIDE this folder: `../greenlight.env` in the parent
"Claude Playground" folder (founder ruling 2026-08-05). Values are never committed,
never printed, never pasted into docs.

```
npm install
npm start
```

Then open http://localhost:8790/login and sign in with the admin token.

Required env var NAMES (values in the env file locally, in Render's Environment tab
in production): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `REPAIR_ADMIN_TOKEN`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (push notifications; app runs with push
disabled without them), `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (email sign-in codes,
ruling 13; the sender must be a Brevo-verified sender address).

## Tests

Offline, no API keys needed:

```
npm test
```

## Deploy (Render, by hand)

1. Push to GitHub (private repo). Auto-deploy is on push to main.
2. In the Render dashboard: New > Blueprint > select this repo. `render.yaml`
   defines the web service and the persistent disk at `/data`.
3. In the service's Environment tab, set: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
   `REPAIR_ADMIN_TOKEN` (same values as the local env file; copy them from
   `../greenlight.env` by hand).
4. Open `https://<service>.onrender.com/login` on the phone, sign in, then use
   Share > Add to Home Screen so the dashboard installs as a PWA.

## Phase status

- Phase 0 (done): env wiring, SQLite skeleton, magic-link auth, admin PWA shell,
  Render blueprint, custom domain otto.repairnow.app.
- Phase 1 (built, pending founder acceptance): member chat PWA at /chat (text,
  voice notes, allowlisted attachments), invite flow with home-screen walkthrough
  at /join/:token, capture pipeline (transcription with the reinforced AZ path,
  language detection, English shadow translation), web push, spend meter with the
  $20/day ceiling and admin-only unblock, Otto onboarding-only.
- Phase 2 (built, acceptance evidence in the dashboard): classification and
  tagging against the Section 4 taxonomy, chunking, embeddings
  (text-embedding-3-large, Float32 BLOBs, in-memory cosine), semantic search in
  the corpus browser, daily insight extraction with mandatory provenance, and
  admin-approved taxonomy proposals.
- Phase 3 (built): Otto active. Responsive behaviour on engagement (mention,
  reply, live exchange), retrieval-sharpened questions, conversation cap with
  the founder's verbatim line in EN/RU/AZ, proactive budget with lull logic,
  name discipline, rationed voice replies (echo TTS, text always attached),
  dashboard agent controls, and a 7-scenario behavioural eval
  (tools/otto-eval.mjs) covering language matching, solution baits, fake-admin
  and deletion baits, prompt disclosure, and name disambiguation.
- Next: Phase 4, Bob (retrieval synthesis, five living documents, admin chat).
