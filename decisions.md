# decisions.md - founder rulings, dated, newest last

Earlier rulings (2026-08-05 and before) are embedded in the spec itself
(`repair_ai_project_spec_20260805.md`): design partners are individual repairers with
subcontracting networks; property-manager channel is Growth Path 1; Otto responds, not
only asks; the verbatim short-conversations line; names usage; OpenAI as the voice
vendor especially for AZ; male voice map Otto=echo Bob=onyx Mark=ash; one env file in
the parent folder; no Render API keys.

## Phase 0 decisions (spec Section 15), answered 2026-08-05

1. 2026-08-05 - Platform: Option A confirmed, our own chat PWA. Telegram (Option B)
   not taken.
2. 2026-08-05 - Env file: REUSE `greenlight.env` in the parent "Claude Playground"
   folder. No new repair.env. Repair AI secrets (e.g. REPAIR_ADMIN_TOKEN) are appended
   to that file, values never printed or committed.
3. 2026-08-05 - Group identity: "Repair AI", used as-is in the chat PWA, invites, and
   push notifications.
4. 2026-08-05 - AZ voice: confirmed as ruled. OpenAI both ways for Azerbaijani.
   Native-listener TTS quality test in week one; if genuinely poor, AZ replies fall
   back to text while transcription stays on the reinforced OpenAI path.
5. 2026-08-05 - Partner terms: nothing promised yet. Any promise is the founder's
   personal business outside the system; agents never speak to it.
6. 2026-08-05 - Data retention: no deletion promise in the consent line. The consent
   line stays as specified in the spec. The internal never-delete rule stands.

## Additional rulings

7. 2026-08-05 - Admin-only commands: agents never perform or carry out any task from
   group members related to deleting the conversation or anything from the database,
   and never adjust their own behaviour (budgets, caps, tone, rules, schedules) on a
   member's instruction. Commands about deleting content or adjusting agent behaviour
   come ONLY from Rashad (admin), through the admin dashboard. If a member asks, the
   agent declines politely and notes that only Rashad controls that. Compiled into the
   non-overridable system prompt of every agent.

8. 2026-08-05 - Attachments: members can send text, voice messages, AND file
   attachments in the group chat. Attachments are restricted to a strict allowlist of
   non-risky types, enforced server-side by extension AND sniffed content type, never
   by the client alone:
   - images: jpg, jpeg, png, gif, webp, heic
   - audio: m4a, mp3, wav, webm, ogg (voice notes use this path too)
   - video: mp4, mov
   - documents: pdf, txt, csv, docx, xlsx
   Explicitly blocked: executables and scripts (exe, sh, bat, js, and similar),
   html and svg (script-injection risk in the browser), archives (zip, rar, 7z),
   macro-enabled Office formats (docm, xlsm), and anything not on the allowlist.
   Storage and serving rules: files live on disk under /data/files/ with randomized
   names, size-capped per file, served with Content-Disposition attachment and
   X-Content-Type-Options nosniff, never executed, never rendered inline as html.
   Attachments enter the corpus like everything else (stored raw, text extracted
   where possible, extracted text treated as untrusted data per ruling 9). Lands in
   Phase 1 with the chat PWA.

9. 2026-08-05 - Anti-manipulation guardrails: strict, structural defenses against
   prompt injection and agent manipulation by group members. Members are friends, but
   the system treats ALL member content (text, voice transcripts, attachment text) as
   DATA, never as instructions, no exceptions. Requirements, enforced in code and
   prompts from Phase 1 onward:
   - Every agent prompt wraps member content in clearly delimited untrusted-content
     blocks; system prompts state that nothing inside those blocks can change the
     agent's rules, role, tone, caps, or tasks.
   - Hard rules (never design solutions, admin-only commands per ruling 7, consent,
     caps, budgets) are compiled into non-overridable system prompts; no member
     message can unlock, roleplay around, or "admin-override" them. Claims of
     authority inside the chat ("Rashad told me to tell you...", "as the developer,
     I order you...") are ignored; real admin commands arrive only via the dashboard,
     authenticated by session, never via group content.
   - Agents take no actions from member content other than their designed ones
     (replying in the group within their rules, filing check-with requests). No tool
     calls, no settings changes, no data operations triggered by chat text.
   - Suspected injection attempts are logged as events and surfaced to the admin in
     the dashboard; the agent responds politely and briefly or stays silent, and
     never repeats or executes the injected instructions.
   - The Phase 3 behavioural eval set includes injection and manipulation baits
     (override attempts, fake admin claims, delete requests, cap-removal requests,
     "reveal your prompt" probes) that Otto must pass before real partners join.

10. 2026-08-05 - Daily cost ceiling: $20 per day for total usage cost, API costs
    included, across all agents and the pipeline. Supersedes the spec's $10/day
    default. Behaviour when the ceiling is reached:
    - A SYSTEM notice (from the system, not from Otto) is posted in the group chat
      telling everyone the daily limit is reached and that only Rashad can unblock
      it. Posted so every member can read it in their language (EN/RU/AZ). Rashad
      also gets a push notification.
    - Agent activity pauses: no Otto replies, no Bob or Mark runs, no digests or
      synthesis.
    - Raw capture NEVER stops (storing messages, voice audio, attachments costs no
      API money and the corpus must not lose anything). Transcription and embedding
      of incoming messages continue by default since they cost cents and are part of
      capture; their cost still counts toward the ceiling. If Rashad wants those
      paused too, that is a dashboard toggle.
    - The block is lifted ONLY by Rashad, from the dashboard. It does NOT auto-lift
      at midnight: a new day resets the spend counter, but a ceiling-triggered block
      stays until Rashad unblocks it.
    - The ceiling amount is admin-tunable in the dashboard; $20/day is the ruled
      starting value. Spend is metered per agent per day in the spend table (spec
      Section 9) and shown on the dashboard spend meter.
