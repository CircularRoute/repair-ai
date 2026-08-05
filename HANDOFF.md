# HANDOFF - Repair AI, state of the build

Updated 2026-08-05 (post test-data wipe), end of the build day that took the
project from an empty folder to the complete design-partner system. Read `CLAUDE.md` first, then this,
then `decisions.md` for every founder ruling. The spec
(`repair_ai_project_spec_20260805.md`) remains the source of truth for intent;
this document is the source of truth for what exists.

## Where things run

- Production: https://otto.repairnow.app (Render web service `repair-ai`,
  service id srv-d9pdcjm417fc73dltd00, blueprint-managed from `render.yaml`,
  auto-deploys on push to main). The bare repair-ai.onrender.com URL belongs to
  an unrelated old service; the real Render URL is repair-ai-vlmf.onrender.com.
- Repo: github.com/CircularRoute/repair-ai (private). The founder also drives
  builds from phone Claude Code sessions against this repo.
- DNS: otto.repairnow.app CNAME to repair-ai-vlmf.onrender.com; TLS by Render.
- Secrets: locally in `../greenlight.env` (parent folder, referenced by path,
  never committed); on Render in the Environment tab, set by hand by the
  founder. Names: ANTHROPIC_API_KEY, OPENAI_API_KEY, REPAIR_ADMIN_TOKEN,
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, BREVO_API_KEY, BREVO_SENDER_EMAIL
  (currently rashad@circularroute.com, Brevo-verified).
- Data: SQLite on the Render disk at /data (repair.db, audio/, files/,
  knowledge/). Local dev uses ./data (gitignored).

## Status: all six spec phases are built and accepted

- Phase 0: repo, Render blueprint, env wiring, magic-link auth, admin PWA.
- Phase 1: member chat PWA (/chat) with text, voice notes (10-minute member
  cap, auto-send), allowlisted attachments (ruling 8), invite flow, push
  notifications (VAPID), capture pipeline (gpt-4o-transcribe + whisper-1
  fallback, reinforced AZ path with second pass + glossary post-edit, language
  detection from words, English shadow translation), spend meter with the
  $20/day ceiling (ruling 10), Otto onboarding with the consent line.
- Phase 2: Haiku classification against the Section 4 taxonomy, chunking,
  embeddings (text-embedding-3-large, Float32 BLOBs in SQLite, in-memory
  cosine), semantic search in the corpus browser, Sonnet insight extraction
  with enforced provenance, taxonomy proposals with admin approve/reject.
- Phase 3: Otto active. Engagement per ruling 14 (mention in text/voice,
  explicit reply, or first message after Otto; nothing else), conversation cap
  (default 4) ending with the founder's verbatim line in EN/RU/AZ, proactive
  budget (3/day, 3h spacing, built-in 10-minute courtesy lull, 8h staleness
  guard), name discipline, rationed TTS voice replies (echo), behavioural eval
  (tools/otto-eval.mjs, 8 scenarios incl. ruling-9 manipulation baits).
- Phase 4: Bob. Five living documents (problem-map, opportunity-register,
  product-concepts incl. the Lead-to-Order Bridge, roadmap, build-specs) plus
  memo and digest, versioned with provenance in `documents`; real-time admin
  chat with citations (Opus 5, Fable 5 behind the toggle for deep runs).
- Phase 5: Mark. Web-search research (Sonnet 5 + web_search_20260209 with
  pause_turn resume), four market documents (property managers = priority) plus
  on-demand notes, all URL-cited; shared brain: Bob/Mark/knowledge documents are
  chunk-indexed under pseudo message ids (doc:<type>, kn:<id>) into the same
  retrieval space; Mark publish triggers Bob incremental updates; check-with
  protocol end to end (agent_requests, ack/relay/thin lines per language,
  research queue, admin manual answer/cancel).
- Phase 6: admin tool registry (https-only GET tools, env-var-NAME secrets,
  base-URL pinned; Bob invokes them in chat via a client-tool loop) and
  knowledge upload (txt/md/csv/pdf files, notes incl. spoken, https links).
  Formal DONE WHEN still open: the founder must connect a real OEM sandbox
  (Home Connect signup) and register it; the plumbing is verified live with a
  stand-in API.

## Post-phase founder features (all live)

- Email allowlist sign-in (ruling 13): members = name + email + languages in
  the dashboard; sign-in by 6-digit Brevo-emailed code (typed in-app so the
  session lands in the installed PWA) plus a fallback link; year-long sessions;
  invitation email sent automatically on add; sign-in emails and the invitation
  email are the ONLY external emails ever sent. In-app/wrong-browser detection
  steers users to Safari (iOS) / Chrome (Android); Android gets one-tap install.
- WhatsApp-style UX in chat: day separators (Today/Yesterday/date), delete own
  message (long-press or tap-for-Delete-chip; admin can delete any; redaction
  per ruling 12, content retained for admin, excluded from agents), voice
  bubbles show player only (Otto voice notes always carry text), persistent
  enable-notifications banner until push is on.
- Teaching from the dashboard (the founder's most-valued surface): all three
  agents have private admin chats (text + microphone, any language).
  [DIRECTIVE] outputs become standing instructions stored in settings
  (ottoDirectives/bobDirectives/markDirectives), injected into every run,
  listed with per-item Remove. Mark also takes [RESEARCH] taskings (launches
  real web research); Bob takes [RERUN:<doc|all>]. Directives cannot override
  founder-level hard rules.
- Knowledge: four founder research PDFs are loaded in production (two market
  papers as prior research; two "One Network One Visit" white-space papers
  labeled "exploratory AI analysis, NOT canonical position" in their titles so
  the caveat rides on every retrieved chunk).
- Schedules (all admin-tunable in Agent controls, hours in Central Time,
  DST-aware): nightly digest 22:00 CT; daily full synthesis 23:00 CT gated on
  substance (ruling 15: >=3 member messages AND >=1 new insight; manual button
  bypasses); insight extraction every 6h; Mark full refresh every 7 days plus
  a force-refresh button; queued check-with topics drain between refreshes.
- Member management: multi-language members (ruling 11, main + also-speaks,
  editable via Langs button), remove = retire (access revoked, data kept),
  every voice transcript correctable (corrections feed the per-member glossary).

## Architecture (one Node service, no framework)

- `server.mjs` - http server, all routes, Otto engagement hook, schedulers.
- `lib/db.mjs` - SQLite schema + additive migrations (tables: members,
  sessions, magic_links, login_codes, messages, tags, chunks, insights,
  documents, agent_chat, agent_requests, tools, knowledge, taxonomy_proposals,
  glossary, spend, settings, push_subscriptions, events).
- `lib/claude.mjs` - single Claude choke point: model ids (haiku-4-5,
  sonnet-5, opus-5, fable-5, exact, no dates), spend metering, pause_turn
  resume, client-tool loop, em-dash scrub, untrusted() wrapper (ruling 9).
- `lib/voice.mjs` - OpenAI audio: transcribe (+AZ context pass), tts.
- `lib/pipeline.mjs` - capture: transcribe -> detect -> translate -> classify
  -> chunk/embed; onProcessed hook drives Otto; corrections never overwritten.
- `lib/otto.mjs` (onboarding, id otto-r) + `lib/otto-engine.mjs` (engagement,
  cap, budget, reply/intervention/relay generation, admin chat, directives).
- `lib/bob.mjs` - documents, synthesis, digest, chat with tools, directives,
  substance gate, doc indexing. `lib/insights.mjs`, `lib/classify.mjs`,
  `lib/taxonomy.mjs`, `lib/embeddings.mjs` - corpus intelligence.
- `lib/mark.mjs` - research runs, market docs, chat/taskings/directives,
  shelf answers, queue. `lib/tools.mjs`, `lib/knowledge.mjs` - Phase 6.
- `lib/spend.mjs` - $20/day ceiling, trilingual block notice, admin-only
  unblock, capture never stops. `lib/chat.mjs`, `lib/push.mjs`,
  `lib/files.mjs`, `lib/auth.mjs`, `lib/email.mjs`, `lib/lang.mjs` - plumbing.
- Frontend: `public/chat/` (member PWA), `public/admin/` (dashboard PWA),
  `public/login.html` (email code + admin token), `public/join.html`,
  `public/signin.html`. No build step, plain JS.

## Testing

- `npm test` - 79 offline tests (no API keys): auth, files allowlist, spend
  ceiling, language heuristics, Otto engine (engagement/cap/budget), Bob
  (versioning/gate/model routing), corpus (taxonomy/chunking/provenance),
  tools/knowledge guards, repo-wide em-dash guard.
- `node tools/otto-eval.mjs` - live behavioural eval (costs cents): language
  matching, digging style, solution bait, fake-admin/deletion/cap-removal
  baits, prompt disclosure, check-with routing, name disambiguation.

## Production data state (as of the wipe, ruling 16)

All test-period data was hard-deleted on the founder's command on 2026-08-05:
every test message (including the founder's and test member Elvin's), derived
tags/chunks/insights/documents, all test members and their access, agent
chats, and stored test media. Production now holds ONLY: the admin account
(Rashad) with live sessions, the four Knowledge PDFs and their kn: index,
spend history, settings, and event logs. The corpus, insights, and living
documents start empty and will build from real partner conversation. The wipe
endpoint (POST /api/admin/reset-test-data, admin-only, exact confirmation
phrase "DELETE ALL TEST DATA") still exists; NEVER run it after real partners
join - hard rule 4 governs partner data, and removing this endpoint at launch
is a reasonable hardening step.

## Operational runbook

- Invite a partner: Members > name + email + languages > Add member. They get
  the invitation email, sign in with a code at otto.repairnow.app, Otto
  onboards them with the consent line. LAUNCH GATE is open (Phase 3 passed).
- If push notifications were enabled while signed in as a deleted test member,
  re-enable them once from the chat banner on the admin account.
- Ceiling tripped: Spend meter section force-opens with the Unblock button;
  it never lifts itself (ruling 10).
- AZ voice quality gate: after a native listener judges Otto's AZ TTS, untick
  AZ under voice replies if poor (spec Section 15.4).
- Teach agents: talk to Otto/Bob/Mark in their cards; remove directives there.
- OEM sandbox (open item): developer signup at Home Connect, put the token in
  greenlight.env + Render as e.g. HOME_CONNECT_TOKEN, register in Tools, then
  ask Bob to list appliances; that closes Phase 6's DONE WHEN.
- Remove the fx_rates demo tool in production when no longer wanted.

## Known gaps and candidate next steps

- OEM sandbox connection pending founder signup (above).
- docx knowledge extraction not supported (txt/md/csv/pdf are).
- Chat has no reply-to UI (server supports replyToId; engagement uses it).
- Consider removing the reset-test-data endpoint at launch (see above).
- If the group grows past ~100k chunks, move retrieval to pgvector (spec note).
- The reusable pattern from this build is captured as the user-level skill
  `design-partner` (~/.claude/skills/design-partner/) for future projects.
