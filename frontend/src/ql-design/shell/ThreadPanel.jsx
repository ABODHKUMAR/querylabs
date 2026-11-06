import { useContext, useState } from 'react';
import { QueryLabLogo, Avatar, getInitials } from '../QueryLabLogo';
import { NavContext } from '../NavContext';
import { I } from '../icons';
import { SourceChip } from '../screens/EmptyState';

export function ThreadHeader({ title: titleProp }) {
  const { userMsg } = useContext(NavContext);
  const title = titleProp || userMsg || 'New conversation';

  return (
    <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="h-section">Conversation</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icn"><I.search /></button>
          <button className="icn"><I.more /></button>
        </div>
      </div>
      <h2 style={{
        fontSize: 20, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.3,
        fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600, color: 'var(--ink)',
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {title}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span className="chip">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pos)' }} />
          Live
        </span>
      </div>
    </div>
  );
}

export function ThreadMessage({ role, time, children, foot, refs }) {
  if (role === 'user') {
    return (
      <div style={{ padding: '16px 22px', display: 'flex', gap: 12 }}>
        <Avatar initials={getInitials()} tone="ink" />
        <div style={{ flex: 1 }}>
          <div className="label" style={{ marginBottom: 4 }}>You · {time}</div>
          <div className="body" style={{ color: 'var(--ink)', fontSize: 14.5 }}>{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 12 }}>
      <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <QueryLabLogo size={24} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          Query Labs · {time}
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span style={{ color: 'var(--pos)' }}>● high confidence</span>
        </div>
        <div className="body" style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>{children}</div>
        {refs && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {refs.map((r, i) => (
              <button key={i} className="chip" style={{ background: 'var(--surface-tint)', cursor: 'pointer', fontSize: 11.5 }}>
                <span style={{ color: 'var(--brand)' }}><I.chart /></span>
                {r}
              </button>
            ))}
          </div>
        )}
        {foot && (
          <div style={{ display: 'flex', gap: 4, marginTop: 10, marginLeft: -6 }}>
            <button className="btn ghost sm" style={{ padding: '4px 8px', color: 'var(--ink-3)' }}>↻ Refine</button>
            <button className="btn ghost sm" style={{ padding: '4px 8px', color: 'var(--ink-3)' }}><I.pin /> Pin</button>
            <button className="btn ghost sm" style={{ padding: '4px 8px', color: 'var(--ink-3)' }}><I.code /> SQL</button>
            <button className="btn ghost sm" style={{ padding: '4px 8px', color: 'var(--ink-3)' }}><I.share /> Share</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadComposer({ suggestions = [], disabled = false, live = false, onSubmit: onSubmitProp, placeholder: placeholderProp }) {
  const [draft, setDraft] = useState('');
  const { collections, collection, onCollectionChange, onFollowUp } = useContext(NavContext);
  const handleSubmit = onSubmitProp || onFollowUp;

  const submit = (text) => {
    const val = (text ?? draft).trim();
    if (!val || disabled) return;
    handleSubmit?.(val);
    setDraft('');
  };

  return (
    <div style={{ padding: 16, borderTop: '1px solid var(--line)', background: 'var(--paper)' }}>
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {suggestions.map((c, i) => (
            <button
              key={i}
              className="chip"
              style={{ fontSize: 11.5, cursor: disabled ? 'default' : 'pointer' }}
              onClick={() => { if (!disabled) submit(c); }}
            >{c}</button>
          ))}
        </div>
      )}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: 12,
        opacity: disabled ? 0.6 : live ? 0.85 : 1,
        boxShadow: 'var(--sh-1)',
      }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={
            placeholderProp ? placeholderProp
            : disabled ? 'Approve the plan to continue the conversation…'
            : live ? 'Queue a follow-up while Query Labs finishes…'
            : 'Ask a follow-up question…'
          }
          disabled={disabled}
          rows={1}
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', fontFamily: 'var(--sans)', fontSize: 13.5,
            color: 'var(--ink)', minHeight: 36, lineHeight: 1.5, padding: '4px 0 8px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {disabled && <span className="label">Composer paused</span>}
            {live && (
              <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pulse-dot" /> live
              </span>
            )}
            {!disabled && !live && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button className="icn" style={{ width: 28, height: 28 }}><I.attach /></button>
                {collections?.length > 0
                  ? <SourceChip collections={collections} collection={collection} onCollectionChange={onCollectionChange} />
                  : <button className="icn" style={{ width: 28, height: 28 }}><I.database /></button>
                }
                <button className="icn" style={{ width: 28, height: 28 }}><I.filter /></button>
              </div>
            )}
          </div>
          <button
            onClick={() => submit()}
            className="icn bordered"
            style={{
              width: 30, height: 30,
              background: disabled ? 'var(--paper-2)' : draft.trim() ? 'var(--ink)' : live ? 'var(--ink-4)' : 'var(--paper-2)',
              color: disabled || (!draft.trim() && !live) ? 'var(--ink-4)' : 'white',
              borderColor: disabled ? 'var(--line)' : draft.trim() ? 'var(--ink)' : 'var(--line)',
            }}
          >
            <I.arrow />
          </button>
        </div>
      </div>
    </div>
  );
}
