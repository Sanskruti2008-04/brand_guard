// server/engine/services/privacyGuard.js

/**
 * Masks sensitive/confidential data before sending text to external LLM APIs,
 * and returns a restoration map + disclosure metadata.
 */
export function sanitizeForExternalAI(rawText, confidentialTerms = []) {
  let sanitizedText = rawText;
  const tokenMap = new Map();
  let counter = 1;

  const maskPattern = (regex, label) => {
    sanitizedText = sanitizedText.replace(regex, (match) => {
      const placeholder = `[REDACTED_${label}_${counter++}]`;
      tokenMap.set(placeholder, match);
      return placeholder;
    });
  };

  // 1. Mask Emails & Phone Numbers
  maskPattern(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'EMAIL');
  maskPattern(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, 'PHONE');

  // 2. Mask Financial Figures / Unreleased Revenue Numbers (e.g., $4.2M, $150,000)
  maskPattern(/\$\d+(?:,\d{3})*(?:\.\d+)?\s?(?:M|B|K|million|billion)?\b/gi, 'FINANCIAL');

  // 3. Mask Org-Specific Confidential Project Codenames
  confidentialTerms.forEach((term) => {
    if (!term) return;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    maskPattern(new RegExp(`\\b${escaped}\\b`, 'gi'), 'SECRET');
  });

  return {
    sanitizedText,
    tokenMap,
    disclosure: {
      externalAiUsed: true,
      redactedCount: tokenMap.size,
      privacyNotice:
        tokenMap.size > 0
          ? `${tokenMap.size} confidential item(s) were masked locally before external AI analysis.`
          : 'No PII or confidential tokens detected; standard hybrid analysis applied.',
    },
  };
}

/**
 * Restores masked values inside AI-generated suggestions so the user sees intact text.
 */
export function restoreFromExternalAI(aiText, tokenMap) {
  let restored = aiText;
  for (const [placeholder, originalValue] of tokenMap.entries()) {
    restored = restored.split(placeholder).join(originalValue);
  }
  return restored;
}