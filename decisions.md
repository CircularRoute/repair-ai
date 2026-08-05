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
