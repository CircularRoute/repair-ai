// Capture pipeline, Phase 1 scope (spec Section 4 steps 1-4): store raw (done by
// the server before this runs) -> transcribe voice (reinforced AZ path) -> detect
// language -> English shadow translation. Classification, chunking, embeddings,
// and insights arrive in Phase 2. Runs async after the message is stored; capture
// never blocks on it and failures leave the raw message intact with an error flag.

import { logEvent, memberLanguages } from './db.mjs';
import { detectLanguageHeuristic } from './lang.mjs';
import { detectLanguageLLM, translateToEnglish, postEditTranscript } from './claude.mjs';
import { transcribe, transcribeAzWithContext, transcriptAgreement } from './voice.mjs';

const AGREEMENT_LOW_CONFIDENCE = 0.55;

function recentContext(db, beforeTs, limit = 8) {
  const rows = db
    .prepare(
      `SELECT senderId, originalText, transcript FROM messages
       WHERE ts < ? AND status = 'active' AND senderKind != 'system'
       ORDER BY ts DESC LIMIT ?`
    )
    .all(beforeTs, limit)
    .reverse();
  return rows
    .map((r) => `${r.senderId}: ${(r.originalText || r.transcript || '').slice(0, 300)}`)
    .join('\n');
}

export async function processMessage(db, messageId, { onBlock = null } = {}) {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (!msg) return;
  const update = (fields) => {
    const keys = Object.keys(fields);
    db.prepare(`UPDATE messages SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => fields[k]), messageId);
  };

  try {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(msg.senderId);
    const langs = memberLanguages(member);
    let text = msg.originalText;
    let transcriptConfidence = null;
    let transcriptAlt = null;

    // 1. Transcribe voice notes. The language hint is only forced when the
    // member uses exactly one language; multilingual members auto-detect,
    // since a wrong hint is worse than none.
    if (msg.kind === 'voice' && msg.audioPath) {
      const primary = await transcribe(db, {
        audioPath: msg.audioPath,
        languageHint: langs.length === 1 ? langs[0] : undefined,
      });
      let transcript = primary.text;
      transcriptConfidence = 0.9;

      // Reinforced Azerbaijani path: runs when the member is AZ-only, or when
      // a multilingual member's note comes back looking Azerbaijani. Second
      // pass with conversation context, agreement check, Haiku post-edit.
      const looksAz = langs.includes('az') &&
        (langs.length === 1 || detectLanguageHeuristic(transcript) === 'az');
      if (looksAz) {
        const context = recentContext(db, msg.ts);
        try {
          const second = await transcribeAzWithContext(db, { audioPath: msg.audioPath, context });
          if (second.transcript) {
            const agreement = transcriptAgreement(transcript, second.transcript);
            if (agreement < AGREEMENT_LOW_CONFIDENCE) {
              transcriptAlt = second.transcript;
              transcriptConfidence = 0.4;
              logEvent(db, 'pipeline.az.low_confidence', { messageId, agreement });
            }
          }
        } catch (err) {
          logEvent(db, 'pipeline.az.second_pass_failed', { messageId, error: err.message });
        }
        const glossary = db
          .prepare('SELECT wrong, right FROM glossary WHERE memberId = ? ORDER BY addedAt DESC LIMIT 40')
          .all(msg.senderId);
        try {
          transcript = await postEditTranscript(
            db,
            { transcript, altTranscript: transcriptAlt, context, glossary },
            onBlock
          );
        } catch (err) {
          logEvent(db, 'pipeline.az.postedit_failed', { messageId, error: err.message });
        }
      }
      text = transcript;
      update({ transcript, transcriptAlt, transcriptConfidence });
    }

    if (!text || !text.trim()) {
      update({ pipelineStatus: 'done' });
      return;
    }

    // 2. Detect language from the words (heuristic first, Haiku for ambiguity).
    let language = detectLanguageHeuristic(text);
    if (!language) {
      language = await detectLanguageLLM(db, text, onBlock);
    }

    // 3. English shadow translation; the original stays authoritative.
    let englishText = text;
    if (language !== 'en') {
      englishText = await translateToEnglish(db, text, language, onBlock);
    }

    update({ language, englishText, pipelineStatus: 'done', pipelineError: null });
    logEvent(db, 'pipeline.done', { messageId, language, kind: msg.kind });
  } catch (err) {
    update({ pipelineStatus: 'error', pipelineError: err.message });
    logEvent(db, 'pipeline.error', { messageId, error: err.message });
  }
}

// Fire-and-forget scheduling with one retry; capture never waits on this.
export function schedule(db, messageId, opts = {}) {
  setImmediate(async () => {
    await processMessage(db, messageId, opts);
    const row = db.prepare('SELECT pipelineStatus FROM messages WHERE id = ?').get(messageId);
    if (row && row.pipelineStatus === 'error') {
      setTimeout(() => processMessage(db, messageId, opts), 30_000);
    }
  });
}
