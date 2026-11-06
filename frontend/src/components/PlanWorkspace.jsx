import React, { useState } from 'react';
import {
  ChevronDown, Loader2, CheckCircle2, XCircle, Trash2,
  RotateCcw, Brain, Plus,
} from 'lucide-react';
import { ThoughtProcess, ExecutionTrace, InsightsPanel } from './ExecutionOutput';
import './PlanWorkspace.css';

// ── Sub-components ────────────────────────────────────────────────────────────

function StepStatusIcon({ status }) {
  switch (status) {
    case 'in_progress': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />;
    case 'completed':   return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
    case 'failed':      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    default:            return <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />;
  }
}

function ConfidenceBadge({ confidence }) {
  const cls =
    confidence === 'high'   ? 'pw-badge-high' :
    confidence === 'medium' ? 'pw-badge-medium' : 'pw-badge-low';
  return <span className={`pw-confidence ${cls}`}>{confidence}</span>;
}

function SourceChips({ step }) {
  const sources =
    step.selected_sub_sources?.length > 0 ? step.selected_sub_sources :
    step.sub_sources?.length > 0          ? step.sub_sources :
    step.data_source                       ? [step.data_source] : [];
  if (!sources.length) return null;
  return (
    <div className="pw-chips">
      {sources.map(s => <span key={s} className="pw-chip">{s}</span>)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PlanWorkspace = ({
  planState,
  sessionTitle = '',
  activeTab = 'plan',
  onTabChange,
  autoApprove = false,
  onAutoApproveChange,
  onUpdateStep,
  onRemoveStep,
  onAddStep,
  onSetConstraints,
  onApprove,
  onReject,
  onSkip,
  onRegenerate,
  onRetryPlan,
  onContinuePartial,
  onSetAssumption,
  availableAgents = [],
  // Streaming / execution output props
  thoughts = [],
  insights = [],
  isStreaming = false,
}) => {
  const {
    phase,
    editedSteps = [],
    stepStatuses = {},
    userConstraints = '',
    assumptions = [],
    error,
  } = planState;

  const [expandedStepId, setExpandedStepId] = useState(null);
  const [showRegenerateInput, setShowRegenerateInput] = useState(false);
  const [regenerateFeedback, setRegenerateFeedback] = useState('');

  const failedCount = Object.values(stepStatuses).filter(s => s === 'failed').length;
  const completedCount = Object.values(stepStatuses).filter(s => s === 'completed').length;
  const allStepsDone = editedSteps.length > 0 &&
    editedSteps.every(s => ['completed', 'failed'].includes(stepStatuses[s.step_id]));
  const hasIncompleteSteps = editedSteps.some(s => {
    const agents = (s.agent_name || '').split(',').map(a => a.trim()).filter(Boolean);
    return agents.length === 0 || !s.task?.trim();
  });

  const phaseLabel = phase === 'executing' ? 'Run' : phase === 'complete' ? 'Read' : 'Plan';
  const totalSteps = editedSteps.length;
  const currentStep = Math.min(completedCount + 1, totalSteps || 1);

  const handleRegenerateSubmit = () => {
    const feedback = regenerateFeedback.trim() || null;
    setShowRegenerateInput(false);
    setRegenerateFeedback('');
    onRegenerate?.(feedback);
  };

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="pw-center-state">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Analyzing your question...</p>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="pw-center-state">
        <XCircle className="w-6 h-6 text-red-500 mb-3" />
        <p className="text-sm text-red-600 mb-4">{error || "Couldn't generate a plan."}</p>
        <div className="flex items-center gap-3">
          <button onClick={() => onRegenerate?.(null)} className="pw-btn-outline">
            <RotateCcw className="w-3.5 h-3.5" /> Retry Plan
          </button>
          <button onClick={() => onSkip?.()} className="text-xs text-blue-600 hover:underline">
            Execute Without Plan →
          </button>
        </div>
      </div>
    );
  }

  // ── HEADER (shared across pending_approval, executing, complete) ───────────
  const header = (
    <div className="pw-header">
      {/* Breadcrumb */}
      <p className="pw-breadcrumb">Step {currentStep} of {totalSteps || '?'} · {phaseLabel}</p>

      {/* Title + tabs */}
      <div className="pw-title-row">
        <div className="pw-title-left">
          <h2 className="pw-title">{sessionTitle ? `${sessionTitle} — Plan review` : 'Plan review'}</h2>
          {phase === 'pending_approval' && <span className="pw-editable-badge">editable</span>}
        </div>
        <div className="pw-tabs">
          {['plan', 'run'].map(tab => (
            <button
              key={tab}
              className={`pw-tab ${activeTab === tab ? 'pw-tab-active' : ''}`}
              onClick={() => onTabChange?.(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

    </div>
  );

  // ── RUN TAB (executing) ────────────────────────────────────────────────────
  const runTabContent = (
    <div className="pw-scroll-body">
      {/* Step status list */}
      <div className="pw-step-list">
        {editedSteps.map((step, idx) => (
          <div key={step.step_id} className="pw-step-card">
            <div className="pw-step-row">
              <span className="pw-step-num">{String(idx + 1).padStart(2, '0')}</span>
              <StepStatusIcon status={stepStatuses[step.step_id] || 'pending'} />
              <span className="pw-step-desc flex-1">{step.description}</span>
              <SourceChips step={step} />
            </div>
            {stepStatuses[step.step_id] === 'failed' && step._error && (
              <p className="pw-step-error">{step._error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Execution output — thought cards & tool calls stream here */}
      {(thoughts.length > 0 || insights.length > 0) && (
        <div className="pw-execution-output">
          <ThoughtProcess
            thoughts={thoughts}
            isActive={isStreaming}
            hasResponse={false}
          />
          <ExecutionTrace
            thoughts={thoughts}
            isActive={isStreaming}
          />
          {insights.length > 0 && (
            <InsightsPanel insights={insights} />
          )}
        </div>
      )}

      {failedCount > 0 && allStepsDone && (
        <div className="pw-failed-banner">
          <p className="text-xs text-red-600 mb-2">{failedCount} step{failedCount !== 1 ? 's' : ''} failed.</p>
          <div className="flex items-center gap-3">
            <button onClick={() => onRetryPlan?.()} className="pw-btn-outline">
              <RotateCcw className="w-3.5 h-3.5" /> Retry Plan
            </button>
            <button onClick={() => onContinuePartial?.()} className="text-xs text-blue-600 hover:underline">
              Continue with partial results
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── PLAN TAB (pending_approval) ────────────────────────────────────────────
  const planTabContent = (
    <div className="pw-scroll-body">
      {/* Inline regenerate feedback */}
      {showRegenerateInput && (
        <div className="pw-regen-input-row">
          <input
            type="text"
            value={regenerateFeedback}
            onChange={e => setRegenerateFeedback(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegenerateSubmit()}
            placeholder="What should be different? (optional)"
            autoFocus
            className="pw-regen-input"
          />
          <button onClick={handleRegenerateSubmit} className="pw-btn-primary text-xs px-3 py-1.5">Go</button>
        </div>
      )}

      {/* Step list */}
      <div className="pw-step-list">
        {editedSteps.map((step, idx) => {
          const isExpanded = expandedStepId === step.step_id;
          const agents = (step.agent_name || '').split(',').map(a => a.trim()).filter(Boolean);

          return (
            <div
              key={step.step_id}
              className={`pw-step-card ${isExpanded ? 'pw-step-card-active' : ''}`}
            >
              {/* Collapsed row */}
              <div
                className="pw-step-row pw-step-row-clickable"
                onClick={() => setExpandedStepId(isExpanded ? null : step.step_id)}
              >
                <span className="pw-step-num">{String(idx + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <span className="pw-step-desc">{step.description}</span>
                  <SourceChips step={step} />
                </div>
                <div className="pw-step-right">
                  {agents.length > 0 && (
                    <div className="pw-agent-row">
                      {agents.map(name => (
                        <span key={name} className="pw-agent-badge">{name}</span>
                      ))}
                    </div>
                  )}
                  <ConfidenceBadge confidence={step.confidence} />
                  {step.time_estimate && (
                    <span className="pw-time-est">{step.time_estimate}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveStep?.(step.step_id); }}
                    className="pw-remove-btn"
                    title="Remove step"
                  >
                    <Trash2 size={12} />
                  </button>
                  <span className="pw-chevron" style={{ transform: isExpanded ? 'rotate(0)' : 'rotate(-90deg)' }}>
                    <ChevronDown size={14} />
                  </span>
                </div>
              </div>

              {/* Expanded edit area */}
              {isExpanded && (
                <div className="pw-expand-area">
                  {/* Plain English description */}
                  <div className="pw-field">
                    <label className="pw-field-label">Edit step in plain English</label>
                    <textarea
                      value={step.description}
                      onChange={e => onUpdateStep?.(step.step_id, { description: e.target.value })}
                      rows={2}
                      className="pw-textarea"
                    />
                  </div>

                  {/* Agent selector */}
                  <div className="pw-field">
                    <label className="pw-field-label">Agent(s) — select one or more</label>
                    <div className="pw-agent-list">
                      {(() => {
                        const selected = new Set(
                          (step.agent_name || '').split(',').map(a => a.trim()).filter(Boolean)
                        );
                        const toggle = (agentName) => {
                          const next = new Set(selected);
                          if (next.has(agentName)) next.delete(agentName); else next.add(agentName);
                          const newAgentNames = [...next];
                          const newSubSources = [...new Set(
                            newAgentNames.flatMap(n => {
                              const card = availableAgents.find(c => (typeof c === 'string' ? c : c.name) === n);
                              return (card && typeof card === 'object' && card.sub_sources) ? card.sub_sources : [];
                            })
                          )];
                          onUpdateStep?.(step.step_id, {
                            agent_name: newAgentNames.join(', '),
                            ...(newSubSources.length > 0 && { sub_sources: newSubSources, selected_sub_sources: [] }),
                          });
                        };
                        return availableAgents.map(item => {
                          const name = typeof item === 'string' ? item : item.name;
                          return (
                            <label key={name} className="pw-agent-check">
                              <input
                                type="checkbox"
                                checked={selected.has(name)}
                                onChange={() => toggle(name)}
                                className="w-3 h-3 accent-blue-600"
                              />
                              <span>{name}</span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Sub-sources */}
                  {step.sub_sources?.length > 0 && (
                    <div className="pw-field">
                      <label className="pw-field-label">Sub-sources — narrow down</label>
                      <div className="pw-agent-list">
                        {step.sub_sources.map(src => {
                          const isAllSelected = !step.selected_sub_sources?.length;
                          const isChecked = isAllSelected || step.selected_sub_sources.includes(src);
                          const toggle = () => {
                            const current = step.selected_sub_sources?.length
                              ? new Set(step.selected_sub_sources)
                              : new Set(step.sub_sources);
                            if (current.has(src)) current.delete(src); else current.add(src);
                            const next = [...current];
                            onUpdateStep?.(step.step_id, {
                              selected_sub_sources: next.length === step.sub_sources.length ? [] : next,
                            });
                          };
                          return (
                            <label key={src} className="pw-agent-check">
                              <input type="checkbox" checked={isChecked} onChange={toggle} className="w-3 h-3 accent-purple-600" />
                              <span>{src}</span>
                            </label>
                          );
                        })}
                      </div>
                      {step.selected_sub_sources?.length > 0 && step.selected_sub_sources.length < step.sub_sources.length && (
                        <p className="mt-1 text-[10px] text-purple-600">
                          ✓ Agent will focus on {step.selected_sub_sources.length} of {step.sub_sources.length} sources
                        </p>
                      )}
                    </div>
                  )}

                  {/* Agent question */}
                  <div className="pw-field">
                    <label className="pw-field-label">Agent question</label>
                    <textarea
                      value={step.task || ''}
                      onChange={e => onUpdateStep?.(step.step_id, { task: e.target.value })}
                      rows={2}
                      className="pw-textarea"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add step */}
      <button className="pw-add-step-btn" onClick={() => onAddStep?.()}>
        <Plus size={14} /> Add a step
      </button>

      {/* Global constraints */}
      <div className="pw-field pw-constraints">
        <textarea
          value={userConstraints}
          onChange={e => onSetConstraints?.(e.target.value)}
          rows={1}
          placeholder="Add constraints or scope (optional) — applied to every agent step"
          className="pw-textarea"
        />
        {userConstraints?.trim() && (
          <p className="mt-1 text-[10px] text-green-600">✓ Constraint will be sent to every agent step</p>
        )}
      </div>

      {/* Assumptions */}
      {assumptions.length > 0 && (
        <div className="pw-assumptions">
          <h3 className="pw-assumptions-title">Two assumptions to confirm</h3>
          {assumptions.map(a => (
            <div key={a.id} className="pw-assumption-row">
              <span className="pw-assumption-label">{a.label}</span>
              <div className="pw-assumption-btns">
                {a.options.map(opt => (
                  <button
                    key={opt}
                    className={`pw-assumption-btn ${a.selectedOption === opt ? 'pw-assumption-btn-active' : ''}`}
                    onClick={() => onSetAssumption?.(a.id, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── BODY based on tab ──────────────────────────────────────────────────────
  const body = activeTab === 'run' ? runTabContent : planTabContent;

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  const footer = (
    <div className="pw-footer">
      <span className="pw-footer-hint">Ready to run when you are</span>
      <div className="pw-footer-actions">
        <button className="pw-btn-ghost" onClick={() => onReject?.()}>Reset plan</button>
        <button className="pw-btn-ghost">View retrieval</button>
        <button
          className="pw-btn-primary"
          onClick={() => onApprove?.()}
          disabled={phase === 'pending_approval' && (editedSteps.length === 0 || hasIncompleteSteps)}
          title={hasIncompleteSteps ? 'Each step needs an agent and a question' : undefined}
        >
          {phase === 'executing' ? 'Running...' : 'Run plan'}
        </button>
      </div>
    </div>
  );

  // ── BOTTOM STATUS BAR ──────────────────────────────────────────────────────
  const statusBar = (
    <div className="pw-status-bar">
      <span>Prototype</span>
      <span>·</span>
      <span>1. Plan</span>
      <span>·</span>
      <button className="pw-restart-btn" onClick={() => onReject?.()}>Restart</button>
    </div>
  );

  return (
    <div className="pw-container">
      {header}
      {body}
      {footer}
      {statusBar}
    </div>
  );
};

export default PlanWorkspace;
