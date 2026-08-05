// The taxonomy (spec Section 4). Dynamic but admin-approved: the base set lives
// here; approved proposals from taxonomy_proposals extend it at runtime. Never
// mutated silently.

export const BASE_TAXONOMY = {
  growth: [
    'property-manager-channel',
    'consumer-path',
    'social-media-marketing',
    'direct-sales',
    'referrals-partnerships',
    'reviews-reputation',
    'pricing-offers',
    'local-seo-discovery',
    'brand',
  ],
  operations: [
    'dispatch-scheduling',
    'job-diversion-subcontracting',
    'diagnostics',
    'parts-procurement',
    'inventory',
    'quoting-invoicing-payments',
    'technician-management',
    'customer-communication',
    'warranty-claims',
    'tools-software-in-use',
  ],
  market: [
    'competitors',
    'customer-segments',
    'property-managers',
    'landlords',
    'consumer-side',
    'regulation',
  ],
  'product-ideas': [],
  'vertical-knowledge': [],
  other: [],
};

// All valid tags: top levels plus "top/sub" pairs, extended by approved proposals.
export function validTags(db = null) {
  const tags = new Set();
  for (const [top, subs] of Object.entries(BASE_TAXONOMY)) {
    tags.add(top);
    for (const sub of subs) tags.add(`${top}/${sub}`);
  }
  if (db) {
    const approved = db
      .prepare("SELECT tag FROM taxonomy_proposals WHERE status = 'approved'")
      .all();
    for (const row of approved) tags.add(row.tag);
  }
  return tags;
}

export function taxonomyPromptText(db = null) {
  const lines = [];
  for (const [top, subs] of Object.entries(BASE_TAXONOMY)) {
    lines.push(subs.length ? `${top}: ${subs.map((s) => `${top}/${s}`).join(', ')}` : top);
  }
  if (db) {
    const approved = db
      .prepare("SELECT tag FROM taxonomy_proposals WHERE status = 'approved'")
      .all()
      .map((r) => r.tag);
    if (approved.length) lines.push(`admin-approved additions: ${approved.join(', ')}`);
  }
  return lines.join('\n');
}

// Keeps only tags that exist in the taxonomy; used on every classifier output.
export function sanitizeTags(rawTags, db = null) {
  const valid = validTags(db);
  const out = [];
  for (const t of rawTags || []) {
    const tag = String(t.tag || t).trim().toLowerCase();
    const confidence = Math.max(0, Math.min(1, Number(t.confidence ?? 0.5)));
    if (valid.has(tag) && !out.some((o) => o.tag === tag)) out.push({ tag, confidence });
  }
  return out.length ? out : [{ tag: 'other', confidence: 0.3 }];
}
