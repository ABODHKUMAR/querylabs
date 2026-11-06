import { useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NavContext } from '../NavContext';
import { NavRail } from '../shell/NavRail';
import { I } from '../icons';


function ExecMiniThread() {
  const { onMode } = useContext(NavContext);
  return (
    <div style={{
      width: 64, borderRight: '1px solid var(--line)', background: 'var(--paper)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 0', gap: 14, flexShrink: 0,
    }}>
      <button
        title="Open thread"
        onClick={() => onMode?.('analyst')}
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--brand-soft)', color: 'var(--brand-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', border: 'none',
        }}
      >
        <I.chevron dir="right" />
      </button>
      <div className="label" style={{
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        letterSpacing: '0.14em', color: 'var(--ink-3)',
      }}>
        THREAD COLLAPSED
      </div>
      <div style={{ flex: 1 }} />
      <button className="icn"><I.history /></button>
    </div>
  );
}

function ExecCanvas() {
  const { streamResult, onMode } = useContext(NavContext);
  const summary = streamResult?.exec_summary || '';
  const response = streamResult?.response || '';

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '32px 36px', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 980, margin: '0 auto' }}>
        {/* Executive summary */}
        <div>
          {summary ? (
            <div style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--ink-2)', maxWidth: '72ch' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
            </div>
          ) : response ? (
            <div style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--ink-2)', maxWidth: '72ch' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
            </div>
          ) : (
            <div style={{ fontSize: 16.5, color: 'var(--ink-3)' }}>Analysis complete — see Analyst view for full results.</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24 }}>
          <span className="label" style={{ color: 'var(--ink-4)' }}>Sources up to date</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => onMode?.('analyst')}><I.chart /> Full analysis</button>
            <button className="btn"><I.share /> Share</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExecView({ onMode }) {
  const { onMode: ctxOnMode, userMsg } = useContext(NavContext);
  const handleMode = onMode || ctxOnMode;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail />
      <ExecMiniThread />
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: '14px 28px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--paper)', flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1, marginRight: 16 }}>
            <div className="label" style={{ marginBottom: 2 }}>Step 3 of 3 · Read</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 18, fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600,
                letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {userMsg || 'Analysis'}
              </span>
              <span className="chip querylab" style={{ fontSize: 10.5, flexShrink: 0 }}><I.sparkle /> Exec</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', background: 'var(--paper-2)', borderRadius: 10, padding: 3, gap: 2 }}>
              {['Analyst', 'Exec'].map((m, i) => (
                <button key={i} onClick={() => handleMode?.(m.toLowerCase())} style={{
                  padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: i === 1 ? 'var(--surface)' : 'transparent',
                  boxShadow: i === 1 ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  fontSize: 12.5, fontWeight: 500,
                  color: i === 1 ? 'var(--ink)' : 'var(--ink-3)',
                  fontFamily: 'inherit',
                }}>
                  {m}
                </button>
              ))}
            </div>
            <button className="btn sm"><I.download /> PDF</button>
            <button className="btn sm primary"><I.share /> Share</button>
          </div>
        </div>
        <ExecCanvas />
      </section>
    </div>
  );
}
