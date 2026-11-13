import { normalizeDocument } from './normalizer.js';
import { runDeterministicRules } from './rules/deterministicRules.js';
import { retrieveBrandKnowledge } from './services/retrievalService.js';
import { reasonWithAI } from './services/aiReasoner.js';
import { validateAiFindings } from './services/evidenceValidator.js';
import { calculateScore, SCORING_VERSION } from './services/scoreCalculator.js';

export async function analyze({ documentId, brandId, organizationId, content, format, structure = {} }) {
  const normalized = normalizeDocument(content);
  if (!normalized.text) throw Object.assign(new Error('This document has no extracted text to analyse.'), { status: 422 });
  const knowledge = await retrieveBrandKnowledge(organizationId, normalized.text);
  const deterministic = runDeterministicRules({ text: normalized.text, structure, terminology: knowledge.terminology, facts: knowledge.facts, guidelines: knowledge.guidelines });
  let findings = deterministic.findings;
  let provider = 'none', model = 'deterministic-rules-v1', method = 'deterministic';
  const warnings = [];
  const coverage = {
    tone: false,
    terminology: knowledge.terminology.length > 0 || Number(deterministic.metrics?.terminologyRulesFromGuidelines) > 0,
    fact: knowledge.facts.length > 0,
    messaging: knowledge.guidelines.length > 0,
    accessibility: true,
    visual: false
  };
  try {
    const ai = await reasonWithAI({ content: normalized.text, passages: knowledge.passages, facts: knowledge.facts, terminology: knowledge.terminology });
    const aiFindings = validateAiFindings(Array.isArray(ai.data) ? ai.data : ai.data?.findings, { content: normalized.text, passages: knowledge.passages, facts: knowledge.facts, terminology: knowledge.terminology });
    findings = [...findings, ...aiFindings];
    provider = ai.provider; model = ai.model; method = 'ai-assisted';
    coverage.tone = true;
    coverage.messaging = true;
    coverage.fact = knowledge.facts.length > 0 || knowledge.passages.length > 0;
  } catch (error) {
    warnings.push(`Deterministic analysis — AI provider unavailable. ${error.message}`);
  }
  // The rules engine and the model often flag the same phrase. Keep the highest
  // severity once per problematic phrase so reports are not duplicated.
  const severityRank = { critical: 3, major: 2, minor: 1, info: 0 };
  const byPhrase = new Map();
  for (const item of findings) {
    const key = String(item.problematicText || '').trim().toLowerCase();
    if (!key) { byPhrase.set(Symbol('unique'), item); continue; }
    const existing = byPhrase.get(key);
    if (!existing || (severityRank[item.severity] ?? 0) > (severityRank[existing.severity] ?? 0)) byPhrase.set(key, item);
  }
  findings = [...byPhrase.values()];
  coverage.accessibility = true; // Text readability is always checked; structure-specific checks run when extraction provides structure.
  const score = calculateScore(findings, coverage);
  const counts = findings.reduce((acc,f)=>{ acc[f.severity]=(acc[f.severity]||0)+1; return acc; },{});
  return {
    documentId, brandId: brandId || null, format,
    status: 'complete', method, provider, model, scoringVersion: SCORING_VERSION,
    ...score, findings, warnings,
    summary: `${findings.length} finding(s) identified from ${normalized.text.length.toLocaleString()} characters. ${score.complianceStatus}.`,
    issueCounts: { critical: counts.critical||0, major: counts.major||0, minor: counts.minor||0, info: counts.info||0 },
    metrics: deterministic.metrics,
    retrieval: { facts: knowledge.facts.length, terminologyRules: knowledge.terminology.length, activeGuidelines: knowledge.guidelines.length, retrievedPassages: knowledge.passages.length }
  };
}
