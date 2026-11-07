import { useState, useContext, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QueryLabLogo, QueryLabWordmark, Avatar, getInitials } from '../QueryLabLogo';
import { I } from '../icons';
import { NavContext } from '../NavContext';
import { fetchAgentNames } from '../../api/api';
import { formatSourceLabel } from '../sourceDisplayNames';

function fmtSourceName(col) {
  if (col?.display_name) return col.display_name;
  const raw = col?.name || col?.collection_id || (typeof col === 'string' ? col : '');
  return formatSourceLabel(raw);
}

export function SourceChip({ collections, collection, onCollectionChange }) {
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState({});
  const wrapRef = useRef(null);
  const portalRef = useRef(null);

  // collection is now an array of selected sources; empty = all sources
  const selected = Array.isArray(collection) ? collection : (collection ? [collection] : []);

  const label = selected.length === 0
    ? 'All sources'
    : selected.length === 1
      ? fmtSourceName(selected[0])
      : `${selected.length} sources`;

  const isSelected = (col) => selected.some(s => colsMatch(s, col));

  // Compute fixed position relative to viewport so overflow:hidden ancestors don't clip
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const maxH = 260;
    const spaceAbove = rect.top - 8;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    if (spaceAbove > spaceBelow) {
      setPortalStyle({ bottom: window.innerHeight - rect.top + 6, top: 'auto', left: rect.left, maxHeight: Math.min(maxH, spaceAbove) });
    } else {
      setPortalStyle({ top: rect.bottom + 6, bottom: 'auto', left: rect.left, maxHeight: Math.min(maxH, spaceBelow) });
    }
  }, [open]);

  // Close on outside click — must check both the trigger and the portal div
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const inTrigger = wrapRef.current?.contains(e.target);
      const inPortal  = portalRef.current?.contains(e.target);
      if (!inTrigger && !inPortal) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Single source or none — just a static chip
  if (!collections || collections.length <= 1) {
    return (
      <span className="chip">
        <I.database /> {label}
      </span>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className="chip"
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer', gap: 5 }}
      >
        <I.database /> {label} <I.chevron dir={open ? 'up' : 'down'} size={10} />
      </button>
      {open && createPortal(
        <div ref={portalRef} style={{
          position: 'fixed',
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 10, boxShadow: 'var(--sh-2)',
          zIndex: 9999, minWidth: 240, padding: 6,
          display: 'flex', flexDirection: 'column', gap: 2,
          overflowY: 'auto',
          ...portalStyle,
        }}>
          {/* All sources — clears selection */}
          <button
            onClick={() => { onCollectionChange(null); setOpen(false); }}
            style={{
              textAlign: 'left', padding: '8px 10px', borderRadius: 7,
              border: 'none', cursor: 'pointer',
              background: selected.length === 0 ? 'var(--brand-soft)' : 'transparent',
              color: selected.length === 0 ? 'var(--brand-2)' : 'var(--ink-3)',
              fontSize: 13, fontFamily: 'inherit', fontWeight: selected.length === 0 ? 500 : 400,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <I.database size={12} />
            <span style={{ flex: 1 }}>All sources</span>
            {selected.length === 0 && <I.check size={12} />}
          </button>
          <div style={{ height: 1, background: 'var(--line-soft)', margin: '2px 0' }} />
          {collections.map((col, i) => {
            const name = fmtSourceName(col) || `Source ${i + 1}`;
            const active = isSelected(col);
            return (
              <button
                key={i}
                onClick={() => onCollectionChange(col)}
                style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 7,
                  border: 'none', cursor: 'pointer',
                  background: active ? 'var(--brand-soft)' : 'transparent',
                  color: active ? 'var(--brand-2)' : 'var(--ink)',
                  fontSize: 13, fontFamily: 'inherit', fontWeight: active ? 500 : 400,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${active ? 'var(--brand)' : 'var(--line)'}`,
                  background: active ? 'var(--brand)' : 'transparent',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', transition: 'all .1s',
                }}>
                  {active && <I.check size={9} />}
                </span>
                <span style={{ flex: 1 }}>{name}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export function colsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return (a?.collection_id && a.collection_id === b?.collection_id)
    || (a?.id && a.id === b?.id)
    || (a?.name && a.name === b?.name);
}

function EmptyComposer({ value, setValue, onSubmit, collections, collection, onCollectionChange }) {
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 18,
      padding: '16px 18px 14px',
      boxShadow: '0 12px 30px rgba(20,17,14,0.06), 0 1px 0 rgba(20,17,14,0.04)',
    }}>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
        placeholder="Ask about your business data…"
        autoFocus
        style={{
          width: '100%', minHeight: 56, border: 'none', outline: 'none', resize: 'none',
          fontFamily: 'var(--sans)', fontSize: 16, lineHeight: 1.5, color: 'var(--ink)',
          background: 'transparent', padding: '4px 0',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <SourceChip collections={collections} collection={collection} onCollectionChange={onCollectionChange} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="label" style={{ fontSize: 11 }}>↵ to send</span>
          <button
            onClick={submit}
            className="icn bordered"
            style={{
              width: 36, height: 36,
              background: value.trim() ? 'var(--ink)' : 'var(--paper-2)',
              color: value.trim() ? 'var(--paper)' : 'var(--ink-4)',
              borderColor: value.trim() ? 'var(--ink)' : 'var(--line)',
              transition: 'all .15s ease',
            }}
          >
            <I.arrow />
          </button>
        </div>
      </div>
    </div>
  );
}

// Only show suggested starts once the user has picked specific source(s) — and only
// that source's own questions, never a default set or an unrelated fallback.
function pickAgentsToShow(agentCards, selectedCollections) {
  if (!selectedCollections || selectedCollections.length === 0) return [];
  const withQ = agentCards.filter(a => a.suggested_questions?.length > 0);
  return withQ.filter(a => selectedCollections.some(sel => colsMatch(sel, a))).slice(0, 3);
}

export function EmptyState({ onSubmit }) {
  const [draft, setDraft] = useState('');
  const [agentCards, setAgentCards] = useState([]);
  const { collections, collection, onCollectionChange } = useContext(NavContext);

  useEffect(() => {
    fetchAgentNames().then(cards => setAgentCards(cards || [])).catch(() => {});
  }, []);

  const submit = (text) => onSubmit(text);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Top bar */}
      <div style={{
        padding: '16px 28px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--paper)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <QueryLabWordmark size={22} />
          <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
          <div className="body-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
            <span>New conversation</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {collections.length > 0 && (
            <span className="chip">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pos)' }} />
              {collections.length} source{collections.length !== 1 ? 's' : ''} online
            </span>
          )}
          <button className="btn sm"><I.history /> History</button>
          <Avatar initials={getInitials()} tone="querylab" />
        </div>
      </div>

      {/* Centered hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 64px', minHeight: 0, overflow: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <QueryLabLogo size={34} />
              <div className="label" style={{ color: 'var(--brand-2)' }}>Decision support</div>
            </div>
            <h1 style={{
              margin: 0, fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600,
              fontSize: 38, letterSpacing: '-0.025em', lineHeight: 1.08, color: 'var(--ink)',
            }}>
              What would you like to understand today?
            </h1>
          </div>

          <EmptyComposer
            value={draft}
            setValue={setDraft}
            onSubmit={submit}
            collections={collections}
            collection={collection}
            onCollectionChange={onCollectionChange}
          />

          {(() => {
            const ICONS = [<I.chart />, <I.sparkle />, <I.bolt />];
            const shownAgents = pickAgentsToShow(agentCards, collection);
            // No source selected, or the selected source has no suggested questions —
            // show nothing rather than a default/unrelated set.
            if (shownAgents.length === 0) return null;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span className="h-section">Suggested starts</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {shownAgents.map((agent, gi) => {
                    const displayName = fmtSourceName(agent);
                    return (
                      <div key={agent.name} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--brand)', display: 'inline-flex' }}>{ICONS[gi % ICONS.length]}</span>
                          <span className="h-card" style={{ fontSize: 13.5 }}>{displayName}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(agent.suggested_questions || []).map((q, pi) => (
                            <button
                              key={pi}
                              onClick={() => submit(q)}
                              title={agent.name}
                              className="body-sm"
                              style={{
                                textAlign: 'left', border: 'none', background: 'transparent',
                                padding: '8px 10px', margin: '0 -10px', borderRadius: 8,
                                cursor: 'pointer', color: 'var(--ink-2)', fontSize: 13.5,
                                fontFamily: 'inherit', lineHeight: 1.4, transition: 'all .12s ease',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-tint)'; e.currentTarget.style.color = 'var(--ink)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-2)'; }}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
