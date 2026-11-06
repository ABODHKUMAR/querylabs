import { useState, useContext } from 'react';
import { NavContext } from '../NavContext';
import { NavRail } from '../shell/NavRail';
import { ThreadHeader, ThreadMessage, ThreadComposer } from '../shell/ThreadPanel';
import { QueryLabLogo } from '../QueryLabLogo';
import { LineChart } from '../charts';
import { I } from '../icons';

// ── Step state helpers ─────────────────────────────────────────────────────────
function stepState(step, i, planStepStatuses, hasStreamingText) {
  const key = step.step_id ?? step.id ?? step.step_number ?? i;
  const raw = planStepStatuses[key] ?? planStepStatuses[String(key)];
  if (raw) {
    if (raw === 'done' || raw === 'completed' || raw === 'success') return 'done';
    if (raw === 'running' || raw === 'in_progress' || raw === 'started') return 'running';
    return 'queued';
  }
  if (!raw && Object.keys(planStepStatuses).length === 0 && i === 0 && hasStreamingText) return 'running';
  return 'queued';
}

function StepRow({ state, title, detail }) {
  const icon =
    state === 'done' ? (
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--pos-soft)', color: 'var(--pos)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <I.check size={10} />
      </span>
    ) : state === 'running' ? (
      <span className="thinking-orb" />
    ) : (
      <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1.4px solid var(--line-strong)', display: 'inline-block' }} />
    );

  return (
    <div className="fadeup" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
      <div style={{ width: 18, display: 'inline-flex', justifyContent: 'center', marginTop: 2 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: state === 'queued' ? 'var(--ink-4)' : 'var(--ink)' }}>{title}</div>
        {detail && <div className="label" style={{ marginTop: 2, color: state === 'queued' ? 'var(--ink-5)' : 'var(--ink-3)' }}>{detail}</div>}
      </div>
    </div>
  );
}

function normPlanStep(step, i) {
  return {
    title:  step.title || step.description || step.name || step.step_title || `Step ${i + 1}`,
    detail: step.task || step.detail || '',
  };
}

const FALLBACK_STEPS = [
  { title: 'Pulling data from sources',  detail: 'Querying connected databases' },
  { title: 'Running analysis',           detail: 'Processing and aggregating' },
  { title: 'Generating insights',        detail: 'Identifying patterns' },
  { title: 'Preparing response',         detail: 'Building your canvas' },
];

// ── Thought rendering components ───────────────────────────────────────────────

function ThoughtBadge({ thought }) {
  const { type } = thought;
  let label, bg, col, icon;

  if (type === 'agents_loaded') {
    const agent = thought.agent_name || thought.agent || thought.content || 'agent';
    label = `Loaded: ${agent}`;
    bg = '#f0fdf4'; col = '#166534';
    icon = <I.check size={10} />;
  } else if (type === 'thinking') {
    label = thought.agent ? `Querying ${thought.agent}…` : 'Thinking…';
    bg = '#f5f3ff'; col = '#6d28d9';
    icon = <span className="thinking-orb" style={{ width: 8, height: 8 }} />;
  } else if (type === 'tool_call') {
    label = thought.tool || thought.content || 'tool call';
    bg = '#eff6ff'; col = '#1d4ed8';
    icon = <I.database size={10} />;
  } else if (type === 'tool_result') {
    const name = thought.tool || thought.agent || thought.content || 'completed';
    label = `Completed: ${name}`;
    bg = '#f0fdf4'; col = '#15803d';
    icon = <I.check size={10} />;
  } else if (type === 'synthesis_context') {
    const n = thought.agents_used?.length ?? '';
    label = `Synthesising ${n} agent${n !== 1 ? 's' : ''}`;
    bg = '#f5f3ff'; col = '#7c3aed';
    icon = <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />;
  } else {
    return null;
  }

  return (
    <span className="fadeup" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      background: bg, color: col,
    }}>
      {icon} {label}
    </span>
  );
}

function DecomposeCard({ thought }) {
  const label = thought.from_plan
    ? `Using approved plan — ${thought.sub_tasks?.length ?? 0} step(s)`
    : `Decomposed into ${thought.sub_tasks?.length ?? 0} sub-task(s)`;

  return (
    <div className="fadeup" style={{
      background: 'var(--brand-soft)', borderRadius: 8, padding: '10px 12px',
      border: '1px solid rgba(91,69,216,0.2)', fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, color: 'var(--brand-2)', marginBottom: 6, fontSize: 11.5 }}>{label}</div>
      {(thought.sub_tasks || []).map((st, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4,
          paddingLeft: 8, borderLeft: '2px solid rgba(91,69,216,0.3)',
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
            color: 'var(--brand-2)', padding: '1px 5px',
            background: 'rgba(91,69,216,0.1)', borderRadius: 4, flexShrink: 0,
          }}>
            {st.agent}
          </span>
          <span style={{ color: 'var(--ink-2)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {st.task}
          </span>
        </div>
      ))}
    </div>
  );
}

function AgentResponseCard({ thought, thoughts }) {
  const meta = thought.metadata || {};
  const tracedCalls = thoughts.filter(t => t.type === 'agent_tool_trace' && t.agent === thought.agent).length;
  const displayCalls = tracedCalls > 0 ? tracedCalls : meta.tool_calls;

  return (
    <div className="fadeup" style={{
      background: 'rgba(91,69,216,0.04)', border: '1px solid rgba(91,69,216,0.18)',
      borderRadius: 8, padding: '10px 12px', fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>
          {thought.agent}
        </span>
        {thought.truncated && (
          <span style={{ fontSize: 10, background: 'rgba(91,69,216,0.1)', color: 'var(--brand-2)', padding: '1px 5px', borderRadius: 4 }}>
            truncated
          </span>
        )}
      </div>
      {thought.answer && (
        <p style={{
          color: 'var(--ink-2)', lineHeight: 1.5, fontSize: 11.5, margin: '0 0 8px',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {thought.answer}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {meta.mcp_server && (
          <span style={{ fontSize: 10, padding: '2px 6px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 4 }}>
            {meta.mcp_server}
          </span>
        )}
        {displayCalls != null && (
          <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--surface-tint)', color: 'var(--ink-3)', borderRadius: 4 }}>
            {displayCalls} tool call{displayCalls !== 1 ? 's' : ''}
          </span>
        )}
        {meta.total_tokens != null && (
          <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--surface-tint)', color: 'var(--ink-3)', borderRadius: 4 }}>
            {meta.total_tokens} tokens
          </span>
        )}
      </div>
    </div>
  );
}

function ToolTraceRow({ thought, idx }) {
  const seq = thought.seq ?? (idx + 1);
  const seqStr = String(seq).padStart(2, '0');
  const argsStr = thought.args ? JSON.stringify(thought.args).slice(0, 90) : '';
  const isSql = thought.type === 'sql_generated';
  const badgeBg = isSql ? '#1d4ed8' : 'var(--brand)';

  return (
    <div className="fadeup" style={{
      display: 'flex', gap: 8, padding: '7px 0',
      borderBottom: '1px solid var(--line-soft)', alignItems: 'flex-start',
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: badgeBg, color: 'white',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', flexShrink: 0, marginTop: 1,
      }}>
        {seqStr}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>
            {isSql ? 'query_sql' : thought.tool}
          </span>
          {thought.agent && (
            <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>via {thought.agent}</span>
          )}
          {thought.truncated && (
            <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '1px 4px', borderRadius: 4 }}>
              truncated
            </span>
          )}
        </div>
        {isSql && thought.sql ? (
          <code style={{
            display: 'block', fontSize: 10.5, fontFamily: 'var(--mono)', color: '#1d4ed8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            query = {thought.sql.slice(0, 80)}…
          </code>
        ) : argsStr ? (
          <code style={{
            display: 'block', fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--ink-3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {argsStr}
          </code>
        ) : null}
      </div>
    </div>
  );
}

// ── Static fallback checklist (before any thoughts arrive) ─────────────────────
function StaticChecklist({ streamingText }) {
  const len = streamingText.length;
  const items = [
    { text: 'Interpreting your question',      done: true,      running: false },
    { text: 'Querying connected data sources', done: len > 20,  running: len <= 20 },
    { text: 'Running aggregations & joins',    done: len > 60,  running: len > 20  && len <= 60 },
    { text: 'Generating narrative',            done: len > 100, running: len > 60  && len <= 100 },
    { text: 'Building canvas',                 done: len > 150, running: len > 100 && len <= 150 },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((t, i) => (
        <div key={i} className="fadeup" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {t.done    && <span style={{ color: 'var(--pos)', marginTop: 2 }}><I.check size={12} /></span>}
          {!t.done && t.running  && <span className="thinking-orb" style={{ marginTop: 2, width: 12, height: 12 }} />}
          {!t.done && !t.running && <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1.3px solid var(--line-strong)', marginTop: 4, flexShrink: 0 }} />}
          <span className="body-sm" style={{
            color: t.done ? 'var(--ink-2)' : t.running ? 'var(--ink)' : 'var(--ink-4)',
            fontWeight: t.running ? 500 : 400, fontStyle: t.running ? 'italic' : 'normal',
          }}>
            {t.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Live thought panel ─────────────────────────────────────────────────────────
function LiveThoughtPanel({ thoughts, streamingText }) {
  const [toolsOpen, setToolsOpen] = useState(true);

  if (!thoughts || thoughts.length === 0) {
    return <StaticChecklist streamingText={streamingText} />;
  }

  const BADGE_TYPES = new Set(['agents_loaded', 'thinking', 'tool_call', 'tool_result', 'synthesis_context']);
  const badges       = thoughts.filter(t => BADGE_TYPES.has(t.type) && !(t.type === 'synthesis_context' && t.strategy === 'passthrough'));
  const decompose    = thoughts.find(t => t.type === 'decompose' || t.type === 'decompose_fallback');
  const agentResps   = thoughts.filter(t => t.type === 'agent_response');
  const traces       = thoughts
    .filter(t => t.type === 'agent_tool_trace' || t.type === 'sql_generated')
    .sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
  const activeStarts = thoughts.filter(t => t.type === 'agent_tool_start');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Badge row */}
      {badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {badges.map((b, i) => <ThoughtBadge key={i} thought={b} />)}
        </div>
      )}

      {/* Decompose / plan card */}
      {decompose && <DecomposeCard thought={decompose} />}

      {/* Agent response cards */}
      {agentResps.map((r, i) => (
        <AgentResponseCard key={i} thought={r} thoughts={thoughts} />
      ))}

      {/* In-flight tool starts */}
      {activeStarts.map((t, i) => (
        <div key={i} className="fadeup" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="thinking-orb" style={{ width: 10, height: 10 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            {t.agent} → {t.label || t.tool}
          </span>
        </div>
      ))}

      {/* Tool calls section */}
      {traces.length > 0 && (
        <div>
          <button
            onClick={() => setToolsOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              border: 'none', background: 'none', cursor: 'pointer', padding: '6px 0',
              fontFamily: 'var(--sans)', color: 'var(--ink)',
            }}
          >
            <I.chevron dir={toolsOpen ? 'up' : 'down'} size={10} />
            <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em' }}>Tool calls</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1d4ed8', display: 'inline-block' }} />
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-4)' }}>{traces.length}</span>
          </button>
          {toolsOpen && (
            <div style={{ borderTop: '1px solid var(--line-soft)' }}>
              {traces.map((t, i) => <ToolTraceRow key={i} thought={t} idx={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Thread panel ───────────────────────────────────────────────────────────────
function ThinkingThread() {
  const { planData, planStepStatuses, streamingText, streamStatus, userMsg } = useContext(NavContext);

  const steps = planData?.steps || planData?.plan_steps || FALLBACK_STEPS;
  const doneCount = steps.filter((s, i) => stepState(s, i, planStepStatuses, !!streamingText) === 'done').length;

  return (
    <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', background: 'var(--paper)' }}>
      <ThreadHeader />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ThreadMessage role="user" time="now">
          {userMsg || 'Your query'}
        </ThreadMessage>
        <div style={{ height: 1, background: 'var(--line-soft)', margin: '0 22px' }} />
        <div style={{ padding: '14px 22px 18px', display: 'flex', gap: 12 }}>
          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
            <QueryLabLogo size={24} />
            <span style={{
              position: 'absolute', inset: -3, borderRadius: '50%',
              border: '1.5px solid var(--brand)',
              animation: 'querylab-pulse 1.6s ease-in-out infinite', opacity: 0.5,
            }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
              Query Labs · <span style={{ color: 'var(--brand-2)' }}>working on it</span>
              {streamStatus?.message && (
                <><span style={{ color: 'var(--ink-5)' }}>·</span><span>{streamStatus.message}</span></>
              )}
            </div>
            <div className="body" style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>
              {streamingText
                ? <>{streamingText}<span className="streaming-cursor" /></>
                : <>Analysing your data<span className="streaming-cursor" /></>}
            </div>
            {/* Live plan progress */}
            <div className="card" style={{ marginTop: 12, padding: '12px 14px 14px', background: 'var(--surface-tint)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="bars"><span /><span /><span /><span /></span>
                  Plan progress · {doneCount}/{steps.length} done
                </span>
              </div>
              {steps.map((step, i) => {
                const s = normPlanStep(step, i);
                const state = stepState(step, i, planStepStatuses, !!streamingText);
                return <StepRow key={i} state={state} title={s.title} detail={s.detail} />;
              })}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 10, marginLeft: -6 }}>
              <button className="btn ghost sm" style={{ padding: '4px 8px', color: 'var(--ink-3)' }}><I.code /> Live SQL</button>
            </div>
          </div>
        </div>
      </div>
      <ThreadComposer live />
    </div>
  );
}

// ── Canvas ─────────────────────────────────────────────────────────────────────
function ThinkingCanvas() {
  const { streamingText, thoughts } = useContext(NavContext);

  // Real signal — the answer text is actually streaming token-by-token; nothing
  // chart/table-shaped exists yet at this point (see below), so the label reflects
  // that instead of claiming a chart is being drawn.
  const isGenerating = streamingText.length > 0;
  const partial = Math.min(22, Math.max(5, Math.floor(streamingText.length / 10)));
  const aovFull = Array.from({ length: 30 }, (_, i) => 84 + Math.sin(i / 3) * 6 + i * 0.45 + (i > 20 ? 8 : 0));
  const lyFull  = Array.from({ length: 30 }, (_, i) => 78 + Math.sin(i / 3 + 1) * 4 + i * 0.18);
  const aov = aovFull.slice(0, partial);
  const ly  = lyFull.slice(0, partial);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--paper)' }}>

      {/* Insight rail */}
      <div className="card fadeup" style={{ padding: '14px 16px', marginBottom: 14, background: 'var(--surface-tint)', border: '1px solid var(--brand-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><I.sparkle /></span>
          <span className="body-sm" style={{ color: 'var(--ink-2)' }}>
            <strong style={{ color: 'var(--brand-2)' }}>Processing</strong>
            <span style={{ margin: '0 8px', color: 'var(--ink-5)' }}>·</span>
            Fetching data and running analysis<span className="streaming-cursor" />
          </span>
        </div>
      </div>

      {/* Stacked: chart on top, live thinking panel below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>

        {/* Partial chart */}
        <div className="card fadeup" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--brand)' }}><I.chart /></span>
              <span className="h-card">Generating answer</span>
              <span className="chip" style={{ fontSize: 10.5, padding: '2px 6px', background: 'var(--brand-soft)', color: 'var(--brand-2)', border: 'none' }}>
                <span className="pulse-dot" /> {isGenerating ? 'generating' : 'starting…'}
              </span>
            </div>
          </header>
          <div style={{ padding: '4px 16px 14px', position: 'relative' }}>
            <LineChart
              series={[
                { data: aov, color: 'var(--brand)' },
                { data: ly,  color: 'var(--ink-4)', dashed: true },
              ]}
              height={240}
            />
            <div style={{
              position: 'absolute', top: 12, right: 18,
              padding: '4px 8px', borderRadius: 6, background: 'var(--surface)',
              border: '1px solid var(--line)', boxShadow: 'var(--sh-1)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="pulse-dot" />
              <span className="label tabular" style={{ fontSize: 11 }}>{isGenerating ? 'live' : 'waiting for response'}</span>
            </div>
          </div>
        </div>

        {/* Query Labs is thinking — live thought panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span className="thinking-orb" />
            <span className="h-card">Query Labs is thinking</span>
          </header>
          <div style={{ maxHeight: 280, overflow: 'auto', padding: '4px 16px 16px' }}>
            <LiveThoughtPanel thoughts={thoughts || []} streamingText={streamingText} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Entry point ────────────────────────────────────────────────────────────────
export function ThinkingView() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail />
      <ThinkingThread />
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-tint)', flexShrink: 0,
        }}>
          <div>
            <div className="label" style={{ marginBottom: 2 }}>Step 2 of 3 · Run</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20, fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600, letterSpacing: '-0.02em' }}>
                Running plan
              </span>
              <span className="chip" style={{ fontSize: 10.5, background: 'var(--brand-soft)', color: 'var(--brand-2)', border: 'none' }}>
                <span className="bars"><span /><span /><span /><span /></span>
                streaming
              </span>
            </div>
          </div>
          <button className="btn sm">Cancel</button>
        </div>
        <ThinkingCanvas />
      </section>
    </div>
  );
}
