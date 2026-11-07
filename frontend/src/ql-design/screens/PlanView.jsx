import { useState, useContext, useEffect } from 'react';
import { NavContext } from '../NavContext';
import { NavRail } from '../shell/NavRail';
import { ThreadHeader, ThreadMessage, ThreadComposer } from '../shell/ThreadPanel';
import { QueryLabLogo } from '../QueryLabLogo';
import { I } from '../icons';
import { fetchAgentNames } from '../../api/api';
import { formatSourceLabel } from '../sourceDisplayNames';

function agentLabel(agentOrName, agents = []) {
  if (!agentOrName) return '';
  if (typeof agentOrName === 'object') {
    return agentOrName.display_name || formatSourceLabel(agentOrName.name);
  }
  const card = (agents || []).find((c) => (typeof c === 'string' ? c : c.name) === agentOrName);
  if (card && typeof card === 'object' && card.display_name) return card.display_name;
  return formatSourceLabel(agentOrName);
}

// ── Normalise incoming step — SPREAD ORIGINAL FIRST so backend fields survive ─
function normStep(step, i) {
  // Build sub_sources for the UI checkboxes without removing the original data_sources
  const subSources = Array.isArray(step.sub_sources) ? step.sub_sources
    : Array.isArray(step.data_sources) ? step.data_sources
    : Array.isArray(step.sources) ? step.sources
    : (typeof step.data_sources === 'string' && step.data_sources
        ? step.data_sources.split(',').map(s => s.trim())
        : []);

  return {
    ...step,                           // keep ALL original backend fields intact
    step_id:    step.step_id || step.id || `step-${i + 1}`,
    description: step.description || step.title || step.name || step.step_title || `Step ${i + 1}`,
    task:        step.task || step.agent_question || step.question || '',
    agent_name:  Array.isArray(step.agent_name) ? step.agent_name.join(', ') : (step.agent_name || ''),
    sub_sources: subSources,           // UI alias — data_sources is kept via spread above
    selected_sub_sources: step.selected_sub_sources || [],
    confidence:  step.confidence || '',
    rationale:   step.rationale || '',
  };
}

// ── Confidence badge ───────────────────────────────────────────────────────
function ConfidenceBadge({ conf }) {
  if (!conf) return null;
  const c   = conf.toLowerCase();
  const bg  = c === 'high' ? '#d1fae5' : c === 'medium' ? '#fef3c7' : 'var(--paper-2)';
  const col = c === 'high' ? '#065f46' : c === 'medium' ? '#92400e' : 'var(--ink-4)';
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: bg, color: col, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
      {conf}
    </span>
  );
}

// ── Input / Textarea helpers ───────────────────────────────────────────────
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
  fontSize: 13, border: '1px solid var(--line)', background: 'var(--paper)',
  color: 'var(--ink)', fontFamily: 'var(--sans)', outline: 'none',
};
const handleFocus = e => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-soft)'; };
const handleBlur  = e => { e.target.style.borderColor = 'var(--line)';  e.target.style.boxShadow = 'none'; };

// ── Editable step card ─────────────────────────────────────────────────────
function StepCard({ index, step, expanded, onToggle, onUpdate, onRemove, agents }) {
  const agentList    = (step.agent_name || '').split(',').map(a => a.trim()).filter(Boolean);
  const selectedAgents = new Set(agentList);
  const subSources   = step.sub_sources || [];
  const selectedSubs = step.selected_sub_sources?.length
    ? new Set(step.selected_sub_sources)
    : new Set(subSources);

  const toggleAgent = name => {
    const next = new Set(selectedAgents);
    if (next.has(name)) next.delete(name); else next.add(name);
    const newAgentNames = [...next];
    const newSubSources = [...new Set(
      newAgentNames.flatMap(n => {
        const card = (agents || []).find(c => (typeof c === 'string' ? c : c.name) === n);
        return (card && typeof card === 'object' && card.sub_sources) ? card.sub_sources : [];
      })
    )];
    onUpdate({
      agent_name: newAgentNames.join(', '),
      ...(newSubSources.length > 0 && { sub_sources: newSubSources, selected_sub_sources: [] }),
    });
  };

  const toggleSub = src => {
    const cur = step.selected_sub_sources?.length
      ? new Set(step.selected_sub_sources)
      : new Set(subSources);
    if (cur.has(src)) cur.delete(src); else cur.add(src);
    const next = [...cur];
    onUpdate({ selected_sub_sources: next.length === subSources.length ? [] : next });
  };

  const displaySubs = step.selected_sub_sources?.length > 0 ? step.selected_sub_sources : subSources;

  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 12, background: 'var(--paper)',
      overflow: 'hidden', transition: 'border-color .15s',
      ...(expanded ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 3px var(--brand-soft)' } : {}),
    }}>
      {/* ── Collapsed header ── */}
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
      >
        {/* Drag handle */}
        <span style={{ color: 'var(--ink-5)', marginTop: 5, flexShrink: 0 }}><I.grip /></span>

        {/* Step number */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          background: 'var(--brand-soft)', color: 'var(--brand-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
        }}>
          {String(index + 1).padStart(2, '0')}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {step.description}
          </div>
          {(agentList.length > 0 || displaySubs.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {agentList.map(a => (
                <span key={a} className="chip" style={{ fontSize: 10.5, background: 'var(--brand-soft)', color: 'var(--brand-2)', border: 'none' }} title={a}>
                  {agentLabel(a, agents)}
                </span>
              ))}
              {displaySubs.slice(0, 4).map(s => (
                <span key={s} className="chip ghost" style={{ fontSize: 10, color: 'var(--ink-4)' }} title={s}>
                  {formatSourceLabel(s)}
                </span>
              ))}
              {displaySubs.length > 4 && (
                <span className="chip ghost" style={{ fontSize: 10, color: 'var(--ink-4)' }}>+{displaySubs.length - 4} more</span>
              )}
            </div>
          )}
        </div>

        <ConfidenceBadge conf={step.confidence} />

        <button
          className="icn"
          style={{ width: 24, height: 24, flexShrink: 0, marginTop: 1, color: 'var(--ink-4)' }}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove step"
        >
          <I.trash />
        </button>

        <span style={{
          flexShrink: 0, marginTop: 5, color: 'var(--ink-3)', display: 'inline-flex',
          transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s',
        }}>
          <I.chevron dir="down" size={13} />
        </span>
      </div>

      {/* ── Expanded edit form ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Edit step description */}
          <div>
            <div className="label" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, color: 'var(--ink-3)' }}>
              Edit step in plain English
            </div>
            <input
              value={step.description}
              onChange={e => onUpdate({ description: e.target.value })}
              style={inputStyle}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>

          {/* Agent selector */}
          {agents.length > 0 && (
            <div>
              <div className="label" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, color: 'var(--ink-3)' }}>
                Agent(s) — select one or more
              </div>
              <div style={{
                border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px',
                maxHeight: 148, overflowY: 'auto', background: 'var(--surface)',
                display: 'flex', flexDirection: 'column', gap: 1,
              }}>
                {agents.map(a => {
                  const name    = typeof a === 'string' ? a : a.name;
                  const checked = selectedAgents.has(name);
                  return (
                    <label
                      key={name}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 6, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAgent(name)}
                        style={{ width: 13, height: 13, accentColor: 'var(--brand)', flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--sans)' }} title={name}>
                        {agentLabel(a, agents)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-sources selector */}
          {subSources.length > 0 && (
            <div>
              <div className="label" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, color: 'var(--ink-3)' }}>
                Sub-sources — narrow down
              </div>
              <div style={{
                border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px',
                maxHeight: 148, overflowY: 'auto', background: 'var(--surface)',
                display: 'flex', flexDirection: 'column', gap: 1,
              }}>
                {subSources.map(src => {
                  const checked = selectedSubs.has(src);
                  return (
                    <label
                      key={src}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 6, cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-tint)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSub(src)}
                        style={{ width: 13, height: 13, accentColor: 'var(--brand)', flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--sans)' }} title={src}>
                        {formatSourceLabel(src)}
                      </span>
                    </label>
                  );
                })}
              </div>
              {step.selected_sub_sources?.length > 0 && step.selected_sub_sources.length < subSources.length && (
                <div className="label" style={{ marginTop: 4, color: 'var(--brand-2)', fontSize: 10.5 }}>
                  ✓ Agent will focus on {step.selected_sub_sources.length} of {subSources.length} sources
                </div>
              )}
            </div>
          )}

          {/* Agent question */}
          <div>
            <div className="label" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, color: 'var(--ink-3)' }}>
              Agent question
            </div>
            <textarea
              value={step.task}
              onChange={e => onUpdate({ task: e.target.value })}
              rows={2}
              style={{ ...inputStyle, fontSize: 12.5, resize: 'vertical', lineHeight: 1.55 }}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────
function StepSkeleton({ n }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ width: 14, height: 14, marginTop: 6, background: 'var(--paper-2)', borderRadius: 2 }} />
      <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-5)' }}>{n}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 3 }}>
        <div className="shimmer" style={{ height: 13, width: '52%' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="shimmer" style={{ height: 18, width: 64, borderRadius: 20 }} />
          <div className="shimmer" style={{ height: 18, width: 80, borderRadius: 20 }} />
          <div className="shimmer" style={{ height: 18, width: 56, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}

// ── Plan canvas ────────────────────────────────────────────────────────────
function PlanCanvas() {
  const { onRun, planData, planLoading, planError, userMsg } = useContext(NavContext);

  const [editedSteps, setEditedSteps] = useState([]);
  const [expandedId,  setExpandedId]  = useState(null);
  const [constraints, setConstraints] = useState('');
  const [agents,      setAgents]      = useState([]);

  // Initialise editable steps when plan data arrives
  useEffect(() => {
    const raw = planData?.steps || planData?.plan_steps || [];
    if (raw.length > 0) {
      const normed = raw.map(normStep);
      setEditedSteps(normed);
      setExpandedId(null);
    }
  }, [planData]);

  // Fetch available agent names for checkboxes
  useEffect(() => {
    fetchAgentNames().then(list => setAgents(list || [])).catch(() => {});
  }, []);

  const updateStep = (id, changes) =>
    setEditedSteps(prev => prev.map(s => s.step_id === id ? { ...s, ...changes } : s));

  const removeStep = id =>
    setEditedSteps(prev => prev.filter(s => s.step_id !== id));

  const addStep = () => {
    const id = `user-${Date.now()}`;
    const blank = { step_id: id, description: 'New step', task: '', agent_name: '', sub_sources: [], selected_sub_sources: [], confidence: '', rationale: '' };
    setEditedSteps(prev => [...prev, blank]);
    setExpandedId(id);
  };

  const handleRun = () => {
    const approvedPlan = { ...(planData || {}), steps: editedSteps, user_constraints: constraints.trim() || null };
    onRun?.(approvedPlan);
  };

  const totalTime = planData?.total_estimated_time || '';

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
              {userMsg ? `${userMsg} — Plan review` : 'Plan review'}
            </span>
            <span className="chip querylab" style={{ fontSize: 10.5, flexShrink: 0 }}><I.sparkle /> editable</span>
          </div>
        </div>
        {/* Plan / Run / Read breadcrumb */}
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

        {/* Section heading */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 16 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Proposed analysis plan</div>
            <h2 style={{ margin: 0, fontFamily: 'Geist, system-ui, sans-serif', fontWeight: 600, fontSize: 20, letterSpacing: '-0.02em' }}>
              {planLoading ? 'Building your plan…' : planError ? 'Could not generate plan' : "Here's how I'll approach this — review before I run."}
            </h2>
          </div>
          {!planLoading && !planError && editedSteps.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {totalTime && <span className="chip"><I.bolt /> {totalTime}</span>}
              <span className="chip">{editedSteps.length} step{editedSteps.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Error card */}
        {planError && (
          <div className="card" style={{ padding: 14, marginBottom: 16, background: 'var(--neg-soft)', border: '1px solid var(--line)' }}>
            <div className="body-sm" style={{ color: 'var(--neg)', fontWeight: 500 }}>Plan generation failed</div>
            <div className="label" style={{ marginTop: 4 }}>{planError}</div>
            <div className="label" style={{ marginTop: 4, color: 'var(--ink-3)' }}>You can still run the query directly below.</div>
          </div>
        )}

        {/* Step list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {planLoading
            ? [1, 2, 3, 4].map(n => <StepSkeleton key={n} n={String(n).padStart(2, '0')} />)
            : editedSteps.length > 0
              ? editedSteps.map((step, i) => (
                  <StepCard
                    key={step.step_id}
                    index={i}
                    step={step}
                    expanded={expandedId === step.step_id}
                    onToggle={() => setExpandedId(expandedId === step.step_id ? null : step.step_id)}
                    onUpdate={changes => updateStep(step.step_id, changes)}
                    onRemove={() => removeStep(step.step_id)}
                    agents={agents}
                  />
                ))
              : !planError && (
                  <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                    <div className="body-sm" style={{ color: 'var(--ink-3)' }}>No plan steps returned. You can run directly below.</div>
                  </div>
                )
          }
        </div>

        {/* Add step */}
        {!planLoading && (
          <button
            onClick={addStep}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 0', marginBottom: 18,
              border: '1px dashed var(--line-strong)', borderRadius: 10, background: 'transparent',
              color: 'var(--ink-3)', fontSize: 13, fontFamily: 'var(--sans)', cursor: 'pointer',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-strong)'; e.currentTarget.style.color = 'var(--ink-3)'; }}
          >
            <I.plus /> Add a step
          </button>
        )}

        {/* Global constraints */}
        {!planLoading && (
          <div>
            <textarea
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              rows={1}
              placeholder="Add constraints or scope (optional) — applied to every agent step"
              style={{
                ...inputStyle, fontSize: 12.5, resize: 'none', lineHeight: 1.55,
                color: constraints ? 'var(--ink)' : undefined,
              }}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            {constraints.trim() && (
              <div className="label" style={{ marginTop: 4, color: 'var(--pos)', fontSize: 10.5 }}>✓ Constraint will be sent to every agent step</div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '12px 24px', borderTop: '1px solid var(--line)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={planLoading}><I.refresh /> Reset plan</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="label" style={{ color: 'var(--ink-3)', fontSize: 12 }}>
            {planLoading ? 'Building your plan…' : editedSteps.length === 0 ? 'No steps to run' : 'Ready to run when you are'}
          </span>
          <button
            className="btn primary"
            style={{ padding: '8px 18px', fontSize: 13, opacity: (planLoading || editedSteps.length === 0) ? 0.45 : 1 }}
            disabled={planLoading || editedSteps.length === 0}
            onClick={handleRun}
          >
            Run plan <I.arrow />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Left thread panel ──────────────────────────────────────────────────────
function PlanThread() {
  const { userMsg, planLoading } = useContext(NavContext);
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
              Query Labs · <span style={{ color: 'var(--brand-2)' }}>{planLoading ? 'thinking…' : 'proposing a plan'}</span>
              {!planLoading && <><span style={{ color: 'var(--ink-5)' }}>·</span><span>awaiting your approval</span></>}
            </div>
            <div className="body" style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              {planLoading
                ? <>Decomposing your question into steps<span className="streaming-cursor" /></>
                : 'I\'ve broken this into steps and confirmed which sources to use. Click any step to edit agents, sub-sources, or the question, then hit Run.'}
            </div>
            {!planLoading && (
              <div style={{ display: 'flex', gap: 4, marginTop: 10, marginLeft: -6 }}>
                <button className="btn ghost sm" style={{ padding: '4px 8px', color: 'var(--ink-3)' }}>↻ Re-propose</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <ThreadComposer disabled />
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export function PlanView() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail />
      <PlanThread />
      <PlanCanvas />
    </div>
  );
}
