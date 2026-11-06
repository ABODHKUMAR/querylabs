import { useContext } from 'react';
import { NavContext } from '../NavContext';
import { I } from '../icons';

export function CanvasToolbar({ mode, onMode }) {
  const { userMsg } = useContext(NavContext);
  return (
    <div style={{
      padding: '14px 24px',
      borderBottom: '1px solid var(--line)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--surface-tint)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div className="label" style={{ marginBottom: 2 }}>Workspace</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{
              fontSize: 18, letterSpacing: '-0.02em', maxWidth: '100%', minWidth: 0,
              fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600, color: 'var(--ink)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
            }}>
              {userMsg || 'Decision Canvas'}
            </span>
            <span className="chip querylab" style={{ fontSize: 10.5, flexShrink: 0 }}>
              <I.bolt /> auto-updates
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ display: 'flex', background: 'var(--paper-2)', borderRadius: 10, padding: 3, gap: 2 }}>
          {['Analyst', 'Exec'].map((m, i) => (
            <button
              key={i}
              onClick={() => onMode?.(m.toLowerCase())}
              style={{
                padding: '6px 12px',
                borderRadius: 7,
                border: 'none',
                cursor: 'pointer',
                background: mode === m.toLowerCase() ? 'var(--surface)' : 'transparent',
                boxShadow: mode === m.toLowerCase() ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                fontSize: 12.5,
                fontWeight: 500,
                color: mode === m.toLowerCase() ? 'var(--ink)' : 'var(--ink-3)',
                transition: 'all .12s',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <button className="btn sm"><I.download /> Export</button>
        <button className="btn sm primary"><I.share /> Share</button>
      </div>
    </div>
  );
}
