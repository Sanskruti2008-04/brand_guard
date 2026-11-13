import { randomUUID } from 'node:crypto';

const CATEGORIES = ['tone','claim','messaging','grammar','fact','terminology','accessibility','visual'];
const SEVERITIES = ['critical','major','minor','info'];
const allowedCategories = new Set(CATEGORIES);
const allowedSeverity = new Set(SEVERITIES);

// Small models occasionally drift from the requested schema. Accept the common
// aliases so valid findings are not silently discarded.
function inferCategory(text) {
  const hay = String(text || '').toLowerCase();
  if (/banned|preferred term|terminology|vocabulary/.test(hay)) return 'terminology';
  if (/uptime|\bsla\b|certif|approved fact|downtime|guarantee|claim/.test(hay)) return 'fact';
  if (/tone|superlative|hype|voice/.test(hay)) return 'tone';
  if (/alt text|heading|link|accessib|readab/.test(hay)) return 'accessibility';
  if (/grammar|spelling|punctuation/.test(hay)) return 'grammar';
  return 'messaging';
}
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const start = item.span?.start ?? item.offset_start ?? item.start;
  const end = item.span?.end ?? item.offset_end ?? item.end;
  const normalized = {
    ...item,
    category: allowedCategories.has(item.category) ? item.category : inferredCategoryFor({ ...item, start, end }),
    severity: allowedSeverity.has(item.severity) ? item.severity : 'minor',
    title: item.title || item.issue || item.finding || 'Potential brand issue',
    span: { start, end },
    problematicText: item.problematicText ?? item.draft_text,
    finding: item.finding || item.issue,
    passageId: item.passageId ?? item.evidence_id ?? item.passage_id
  };
  return normalized;
}
function inferredCategoryFor(item) {
  return inferCategory([item.category, item.title, item.issue, item.finding, item.explanation, item.problematicText, item.draft_text].filter(Boolean).join(' '));
}

export function validateAiFindings(items, { content, passages, facts, terminology }) {
  const sourceMap = new Map(passages.map(p => [p.passageId, p]));
  const result = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeItem(raw);
    if (!item) continue;
    if (!allowedCategories.has(item.category) || !allowedSeverity.has(item.severity)) continue;
    const quote = String(item.evidenceQuote || '').trim();
    const span = item.span || {};
    let start = Number.isInteger(span.start) ? span.start : null;
    let end = Number.isInteger(span.end) ? span.end : null;
    if (start === null || end === null || start < 0 || end <= start || end > content.length) continue;
    let problematicText = content.slice(start, end);
    if (item.problematicText && problematicText !== item.problematicText) {
      // Offsets can drift by a unit or two (emoji/surrogate pairs are counted
      // differently). Re-anchor to the exact quoted text instead of dropping.
      const near = content.indexOf(item.problematicText, Math.max(0, start - 6));
      const found = near >= 0 ? near : content.indexOf(item.problematicText);
      if (found < 0) continue;
      start = found;
      end = found + item.problematicText.length;
      problematicText = content.slice(start, end);
    }
    const passage = sourceMap.get(item.passageId);
    let verified = false;
    let fact = null, term = null;
    if (passage && quote && passage.text.includes(quote)) verified = true;
    if (!verified && item.factId) {
      fact = facts.find(f => String(f._id) === String(item.factId)) || null;
      const factText = fact ? [fact.claim, fact.value, fact.description, fact.sourceReference].filter(Boolean).join(' ') : '';
      if (fact && quote && factText.includes(quote)) verified = true;
    }
    if (!verified && item.terminologyId) {
      term = terminology.find(t => String(t._id) === String(item.terminologyId)) || null;
      const termText = term ? [term.preferredTerm, term.bannedTerm, ...(term.aliases || []), term.explanation, term.usageNotes, term.sourceReference].filter(Boolean).join(' ') : '';
      if (term && quote && termText.includes(quote)) verified = true;
    }
    result.push({
      issueId: randomUUID(),
      category: item.category, severity: item.severity, title: String(item.title || 'Potential brand issue').slice(0,180),
      span: { start, end }, problematicText, finding: String(item.finding || 'Potential issue identified.').slice(0,1200),
      explanation: String(item.explanation || 'Further review is recommended.').slice(0,2000),
      source: verified ? { document: passage?.document || (fact ? 'Approved facts register' : term ? 'Terminology register' : item.sourceDocument || 'Approved knowledge source'), page: passage?.page ?? null, section: passage?.section || fact?.sourceReference || term?.sourceReference || '', passageId: passage?.passageId || '', verified: true } : null,
      evidenceQuote: verified ? quote : '',
      suggestedCorrection: String(item.suggestedCorrection || '').slice(0,1000),
      reason: String(item.reason || '').slice(0,1000),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
      status: verified ? 'open' : 'needs_human_judgement', method: 'ai',
      finding: verified ? String(item.finding || 'Potential issue identified.') : 'Needs human judgement — no verified supporting source found.'
    });
  }
  return result;
}
