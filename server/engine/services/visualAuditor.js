// server/engine/services/visualAuditor.js

/**
 * Calculates relative luminance for WCAG contrast checks
 */
function getLuminance(hex) {
  const cleanHex = hex.replace('#', '');
  const rgb = [
    parseInt(cleanHex.substring(0, 2), 16) / 255,
    parseInt(cleanHex.substring(2, 4), 16) / 255,
    parseInt(cleanHex.substring(4, 6), 16) / 255,
  ].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));

  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Computes WCAG contrast ratio between two hex colors
 */
function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Audits visual assets & metadata against approved BrandAssets
 * @param {Object} assetPayload - { dominantColors: string[], textHex?: string, bgHex?: string, altText?: string, width?: number, height?: number }
 * @param {Object} brandGuidelines - { approvedHexPalette: string[], minContrastRatio: number }
 */
export function auditVisualAsset(assetPayload, brandGuidelines) {
  const findings = [];
  const approvedPalette = (brandGuidelines.approvedHexPalette || []).map((c) => c.toUpperCase());
  const minContrast = brandGuidelines.minContrastRatio || 4.5; // WCAG AA Standard

  // 1. Accessibility: Missing or weak Alt-Text
  if (!assetPayload.altText || assetPayload.altText.trim().length < 10) {
    findings.push({
      category: 'accessibility',
      severity: 'high',
      ruleRef: 'WCAG-1.1.1-ALT-TEXT',
      message: 'Image asset is missing descriptive alt-text (minimum 10 characters required for screen readers).',
      suggestion: 'Add a concise description of the visual content and any embedded promotional text.',
      engineSource: 'deterministic',
    });
  }

  // 2. Accessibility: Text-to-Background Color Contrast
  if (assetPayload.textHex && assetPayload.bgHex) {
    const ratio = getContrastRatio(assetPayload.textHex, assetPayload.bgHex);
    if (ratio < minContrast) {
      findings.push({
        category: 'accessibility',
        severity: 'high',
        ruleRef: 'WCAG-1.4.3-CONTRAST',
        message: `Foreground (${assetPayload.textHex}) on background (${assetPayload.bgHex}) has a contrast ratio of ${ratio}:1, below the required ${minContrast}:1.`,
        suggestion: `Switch foreground text to ${approvedPalette[0] || '#FFFFFF'} or darken the background container.`,
        engineSource: 'deterministic',
      });
    }
  }

  // 3. Visual Consistency: Off-Brand Palette Detection
  if (approvedPalette.length > 0 && Array.isArray(assetPayload.dominantColors)) {
    const offBrandColors = assetPayload.dominantColors
      .map((c) => c.toUpperCase())
      .filter((hex) => !approvedPalette.includes(hex));

    if (offBrandColors.length > 0) {
      findings.push({
        category: 'visual_consistency',
        severity: 'medium',
        ruleRef: 'BRAND-PALETTE-01',
        message: `Detected off-brand hex color(s): ${offBrandColors.join(', ')}.`,
        suggestion: `Replace non-standard colors with approved brand palette tokens: ${approvedPalette.join(', ')}.`,
        engineSource: 'deterministic',
      });
    }
  }

  return {
    passed: findings.length === 0,
    findings,
    auditTimestamp: new Date().toISOString(),
  };
}