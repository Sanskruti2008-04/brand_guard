// client/src/components/GovernanceDiffCard.jsx
import React from 'react';

export default function GovernanceDiffCard({
  issue,
  disclosure,
  onAccept,
  onReject,
}) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '14px', background: '#ffffff' }}>
      {/* Header: Rule Traceability + Engine Disclosure */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>
          Source: {issue.ruleRef || 'Brand Policy'} • {issue.category}
        </span>
        <span
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '999px',
            background: issue.engineSource === 'deterministic' ? '#dcfce7' : '#e0e7ff',
            color: issue.engineSource === 'deterministic' ? '#166534' : '#3730a3',
            fontWeight: 600,
          }}
        >
          {issue.engineSource === 'deterministic'
            ? 'Deterministic Rule Check (Local)'
            : 'AI Rewrite Suggestion (External LLM)'}
        </span>
      </div>

      {/* Explanation */}
      <p style={{ fontSize: '14px', color: '#1e293b', margin: '0 0 12px 0' }}>
        {issue.message}
      </p>

      {/* Non-Destructive Side-by-Side Diff */}
      {issue.originalText && issue.suggestedText && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
            <strong style={{ color: '#991b1b', display: 'block', marginBottom: '4px' }}>Original Draft</strong>
            <span style={{ textDecoration: 'line-through', color: '#7f1d1d' }}>{issue.originalText}</span>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
            <strong style={{ color: '#166534', display: 'block', marginBottom: '4px' }}>Brand-Safe Suggestion</strong>
            <span style={{ color: '#14532d' }}>{issue.suggestedText}</span>
          </div>
        </div>
      )}

      {/* Privacy & AI Disclosure Footer */}
      {disclosure?.privacyNotice && (
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
          🔒 {disclosure.privacyNotice}
        </div>
      )}

      {/* Human-in-the-Loop Controls */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onAccept(issue)}
          style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
        >
          Accept & Patch Version
        </button>
        <button
          onClick={() => onReject(issue)}
          style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
        >
          Keep Original (Log Override)
        </button>
      </div>
    </div>
  );
}