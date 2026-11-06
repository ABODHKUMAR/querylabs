import { useContext } from 'react';
import { NavContext } from '../NavContext';
import { NavRail } from '../shell/NavRail';
import { ThreadHeader, ThreadMessage, ThreadComposer } from '../shell/ThreadPanel';
import { QueryLabLogo } from '../QueryLabLogo';
import { I } from '../icons';

// ── Left thread panel ──────────────────────────────────────────────────────
function ClarifyThread() {
  const { userMsg } = useContext(NavContext);
  return (
    <div style={{ width: 460, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', background: 'var(--paper)', flexShrink: 0 }}>
      <ThreadHeader />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ThreadMessage role="user" time="now">
          {userMsg || 'Your query'}
        </ThreadMessage>
        <div style={{ height: 1, background: 'var(--line-soft)', margin: '0 22px' }} />
        <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 12 }}>
          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <QueryLabLogo size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
              Query Labs · <span style={{ color: 'var(--brand-2)' }}>needs one detail</span>
            </div>
            <div className="body" style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              Before I build a plan, I want to make sure I get this right.
            </div>
          </div>
        </div>
      </div>
      <ThreadComposer disabled placeholder="Answer on the right to continue…" />
    </div>
  );
}

// ── Main clarify canvas ─────────────────────────────────────────────────────
function ClarifyCanvas() {
  const { userMsg, planData, planError, clarifyAnswering, onAnswerClarification } = useContext(NavContext);
  const question = planData?.clarification_question || '';

  const handleAnswer = (text) => {
    if (clarifyAnswering) return;
    onAnswerClarification?.(text);
  };

  const handleSkip = () => {
    if (clarifyAnswering) return;
    onAnswerClarification?.('', { skip: true });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface-tint)',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="label" style={{ marginBottom: 2 }}>Step 1 of 3 · Plan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 17, fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600,
              letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', maxWidth: 500,
            }}>
              {userMsg ? `${userMsg} — one quick question` : 'One quick question'}
            </span>
            <span className="chip querylab" style={{ fontSize: 10.5, flexShrink: 0 }}><I.sparkle /> clarifying</span>
          </div>
        </div>
        {/* Plan / Run / Read breadcrumb — matches PlanView */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 16 }}>
          {[{ l: 'Plan', on: true }, { l: 'Run', on: false }, { l: 'Read', on: false }].map((s, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11.5, fontWeight: 500, padding: '4px 8px', borderRadius: 6,
                color: s.on ? 'var(--brand-2)' : 'var(--ink-4)',
                background: s.on ? 'var(--brand-soft)' : 'transparent',
              }}>{s.l}</span>
              {i < 2 && <span style={{ width: 16, height: 1, background: 'var(--line)', display: 'inline-block' }} />}
            </span>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 4 }}>Before I build your plan</div>
          <h2 style={{ margin: 0, fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600, fontSize: 20, letterSpacing: '-0.02em' }}>
            I need one more detail
          </h2>
        </div>

        {planError && (
          <div className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--neg-soft)', border: '1px solid var(--line)' }}>
            <div className="body-sm" style={{ color: 'var(--neg)', fontWeight: 500 }}>Couldn't process your answer</div>
            <div className="label" style={{ marginTop: 4 }}>{planError}</div>
            <div className="label" style={{ marginTop: 4, color: 'var(--ink-3)' }}>Try again below, or skip instead.</div>
          </div>
        )}

        <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <QueryLabLogo size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="body" style={{ fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.6 }}>
              {question || 'Could you clarify a detail of your question?'}
            </div>
          </div>
        </div>

        <button
          className="btn ghost sm"
          disabled={clarifyAnswering}
          onClick={handleSkip}
          style={{ opacity: clarifyAnswering ? 0.5 : 1 }}
        >
          Skip — use your best judgement
        </button>
      </div>

      {/* ── Composer (active — this is where the user answers) ── */}
      <ThreadComposer
        disabled={clarifyAnswering}
        onSubmit={handleAnswer}
        placeholder={clarifyAnswering ? 'Building your plan…' : 'Type your answer…'}
      />
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export function ClarifyView() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail />
      <ClarifyThread />
      <ClarifyCanvas />
    </div>
  );
}
