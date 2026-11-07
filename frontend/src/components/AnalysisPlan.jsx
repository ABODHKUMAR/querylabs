import React, { useState, useRef } from 'react';
import {
  ChevronDown, Loader2, CheckCircle2, XCircle,
  Trash2, GripVertical, RotateCcw, Brain,
} from 'lucide-react';
import { formatSourceLabel } from '../ql-design/sourceDisplayNames';

// ── Status icon per step ───────────────────────────────────────────────────

function StepStatusIcon({ status }) {
  switch (status) {
    case 'in_progress':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />;
  }
}

function ConfidenceBadge({ confidence }) {
  const style =
    confidence === 'high'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : confidence === 'medium'
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${style}`}>
      {confidence}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const AnalysisPlan = ({
  planState,
  onUpdateStep,
  onRemoveStep,
  onReorderSteps,
  onSetConstraints,
  onAddStep,
  availableAgents = [],
  onApprove,
  onReject,
  onSkip,
  onRegenerate,
  onRetryPlan,
  onContinuePartial,
  isLastMessage,
}) => {
  const {
    phase,
    editedSteps = [],
    stepStatuses = {},
    userConstraints = '',
    error,
  } = planState;

  // Local UI state
  const [expandedStepId, setExpandedStepId] = useState(null);
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [showRegenerateInput, setShowRegenerateInput] = useState(false);
  const [regenerateFeedback, setRegenerateFeedback] = useState('');

  // Drag-and-drop via native HTML5
  const dragIndexRef = useRef(null);

  const handleDragStart = (index) => { dragIndexRef.current = index; };
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from !== null && from !== toIndex) onReorderSteps?.(from, toIndex);
    dragIndexRef.current = null;
  };

  const handleRegenerateSubmit = () => {
    const feedback = regenerateFeedback.trim() || null;
    setShowRegenerateInput(false);
    setRegenerateFeedback('');
    onRegenerate?.(feedback);
  };

  const failedCount = Object.values(stepStatuses).filter(s => s === 'failed').length;
  const allStepsDone =
    editedSteps.length > 0 &&
    editedSteps.every(s => ['completed', 'failed'].includes(stepStatuses[s.step_id]));
  const hasIncompleteSteps = editedSteps.some(s => {
    const agents = (s.agent_name || '').split(',').map(a => a.trim()).filter(Boolean);
    return agents.length === 0 || !s.task?.trim();
  });

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="mb-3 p-3 rounded-lg bg-gray-50 border border-separator dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
          <span>Analyzing your question...</span>
        </div>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800/50">
        <div className="flex items-start gap-2 mb-3">
          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{error || "Couldn't generate a plan."}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onRegenerate?.(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry Plan
          </button>
          <button
            onClick={() => onSkip?.()}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400 transition-colors"
          >
            Execute Without Plan →
          </button>
        </div>
      </div>
    );
  }

  // ── COMPLETE ──────────────────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <div className="mb-3 transition-all duration-300">
        <button
          onClick={() => setIsPlanExpanded(v => !v)}
          className="w-full flex items-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-lg transition-all duration-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <span
            className="transition-transform duration-200"
            style={{ transform: isPlanExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          </span>
          <Brain className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="flex-1 text-left">Analysis Plan</span>
          {(() => {
            const completedCount = editedSteps.filter(s => (stepStatuses[s.step_id] || 'completed') === 'completed').length;
            const failedCount = editedSteps.filter(s => stepStatuses[s.step_id] === 'failed').length;
            return (
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {editedSteps.length} step{editedSteps.length !== 1 ? 's' : ''}
                </span>
                {completedCount > 0 && failedCount === 0 && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                )}
                {failedCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    {failedCount} failed
                  </span>
                )}
              </div>
            );
          })()}
        </button>

        {isPlanExpanded && (
          <div className="mt-2 bg-surface border border-separator rounded-lg divide-y divide-separator dark:divide-gray-700 overflow-hidden">
            {editedSteps.map((step, idx) => {
              const status = stepStatuses[step.step_id] || 'completed';
              const agents = (step.agent_name || '').split(',').map(a => a.trim()).filter(Boolean);
              return (
                <div key={step.step_id} className="p-3 space-y-2">
                  {/* Row 1: number + status + description */}
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-500 flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <StepStatusIcon status={status} />
                    <span className="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">
                      {step.description}
                    </span>
                    <ConfidenceBadge confidence={step.confidence} />
                  </div>

                  {/* Row 2: agent badges */}
                  {agents.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-7">
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Agent{agents.length > 1 ? 's' : ''}:</span>
                      {agents.map(name => (
                        <span key={name} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" title={name}>
                          {formatSourceLabel(name)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Row 3: task question */}
                  {step.task && (
                    <div className="pl-7">
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide block mb-0.5">Question sent:</span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-800/60 rounded px-2 py-1.5">
                        {step.task}
                      </p>
                    </div>
                  )}

                  {/* Row 4: rationale + data source */}
                  {(step.rationale || step.sub_sources?.length > 0 || step.data_source) && (
                    <div className="pl-7 flex items-start gap-4">
                      {step.rationale && (
                        <p className="flex-1 text-[11px] text-gray-400 dark:text-gray-500 italic leading-snug">
                          {step.rationale}
                        </p>
                      )}
                      <div className="flex items-center gap-1 flex-wrap flex-shrink-0">
                        {(step.selected_sub_sources?.length > 0
                          ? step.selected_sub_sources
                          : step.sub_sources?.length > 0
                            ? step.sub_sources
                            : step.data_source ? [step.data_source] : []
                        ).map(src => (
                          <span key={src} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400" title={src}>
                            {formatSourceLabel(src)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── EXECUTING ─────────────────────────────────────────────────────────────
  if (phase === 'executing') {
    return (
      <div className="mb-3 p-3 rounded-lg bg-surface border border-separator dark:border-gray-700">
        <div className="flex items-center gap-1.5 mb-3">
          <Brain className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Running Analysis Plan</span>
        </div>

        <div className="space-y-2">
          {editedSteps.map((step, idx) => (
            <div key={step.step_id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-500 flex-shrink-0">
                  {idx + 1}
                </span>
                <StepStatusIcon status={stepStatuses[step.step_id] || 'pending'} />
                <span className="flex-1 text-gray-700 dark:text-gray-300">{step.description}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(step.selected_sub_sources?.length > 0
                    ? step.selected_sub_sources
                    : step.sub_sources?.length > 0
                      ? step.sub_sources
                      : step.data_source ? [step.data_source] : []
                  ).map(src => (
                    <span key={src} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400" title={src}>
                      {formatSourceLabel(src)}
                    </span>
                  ))}
                </div>
              </div>
              {stepStatuses[step.step_id] === 'failed' && step._error && (
                <p className="ml-7 text-[10px] text-red-500 dark:text-red-400 leading-snug">
                  {step._error}
                </p>
              )}
            </div>
          ))}
        </div>

        {failedCount > 0 && allStepsDone && (
          <div className="mt-3 pt-3 border-t border-separator">
            <p className="text-xs text-red-600 dark:text-red-400 mb-2">
              {failedCount} step{failedCount !== 1 ? 's' : ''} failed.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onRetryPlan?.()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Plan
              </button>
              <button
                onClick={() => onContinuePartial?.()}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400 transition-colors"
              >
                Continue with partial results
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── PENDING_APPROVAL ──────────────────────────────────────────────────────
  return (
    <div className="mb-3 p-3 rounded-lg bg-surface border border-separator dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <Brain className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Analysis Plan</span>
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">Review and edit before running</span>
      </div>

      {/* Step list */}
      <div className="space-y-1.5 mb-3">
        {editedSteps.map((step, idx) => {
          const isStepExpanded = expandedStepId === step.step_id;
          return (
            <div
              key={step.step_id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className="rounded-lg border border-separator dark:border-gray-700 bg-white dark:bg-gray-800 transition-all duration-150"
            >
              {/* Collapsed row */}
              <div
                className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
                onClick={() => setExpandedStepId(isStepExpanded ? null : step.step_id)}
              >
                <GripVertical
                  className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 cursor-grab"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-[10px] font-medium text-blue-600 dark:text-blue-400 flex-shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {step.description}
                </span>
                {step.agent_name && (
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap max-w-[200px]">
                    {step.agent_name.split(',').map(a => a.trim()).filter(Boolean).map(name => (
                      <span key={name} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 truncate max-w-[96px]" title={name}>
                        {formatSourceLabel(name)}
                      </span>
                    ))}
                  </div>
                )}
                <ConfidenceBadge confidence={step.confidence} />
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveStep?.(step.step_id); }}
                  title="Remove step"
                  className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                <span
                  className="transition-transform duration-200 text-gray-400 flex-shrink-0"
                  style={{ transform: isStepExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* Expanded edit area */}
              {isStepExpanded && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-separator dark:border-gray-700">
                  <div className="pt-2">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                      Agent(s) — select one or more
                    </label>
                    <div className="space-y-1 max-h-36 overflow-y-auto border border-separator dark:border-gray-600 rounded p-1.5 bg-white dark:bg-gray-900">
                      {(() => {
                        const selected = new Set(
                          (step.agent_name || '').split(',').map(a => a.trim()).filter(Boolean)
                        );
                        const toggle = (agentName) => {
                          const next = new Set(selected);
                          if (next.has(agentName)) next.delete(agentName); else next.add(agentName);
                          const newAgentNames = [...next];
                          // Recompute sub_sources as union of all selected agents' sub_sources
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
                            <label key={name} className="flex items-center gap-2 cursor-pointer group px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                              <input
                                type="checkbox"
                                checked={selected.has(name)}
                                onChange={() => toggle(name)}
                                className="w-3 h-3 accent-blue-600 flex-shrink-0"
                              />
                              <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" title={name}>
                                {formatSourceLabel(name)}
                              </span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Sub-sources selector — shown only when sub_sources are available */}
                  {step.sub_sources?.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">
                        Sub-sources — narrow down (all selected by default)
                      </label>
                      <div className="space-y-1 max-h-36 overflow-y-auto border border-separator dark:border-gray-600 rounded p-1.5 bg-white dark:bg-gray-900">
                        {step.sub_sources.map(src => {
                          const isAllSelected = !step.selected_sub_sources?.length;
                          const isChecked = isAllSelected || step.selected_sub_sources.includes(src);
                          const toggle = () => {
                            const current = step.selected_sub_sources?.length
                              ? new Set(step.selected_sub_sources)
                              : new Set(step.sub_sources); // start from all
                            if (current.has(src)) current.delete(src); else current.add(src);
                            // If all selected, store as empty (means "all")
                            const next = [...current];
                            onUpdateStep?.(step.step_id, {
                              selected_sub_sources: next.length === step.sub_sources.length ? [] : next,
                            });
                          };
                          return (
                            <label key={src} className="flex items-center gap-2 cursor-pointer group px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={toggle}
                                className="w-3 h-3 accent-purple-600 flex-shrink-0"
                              />
                              <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" title={src}>
                                {formatSourceLabel(src)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {step.selected_sub_sources?.length > 0 && step.selected_sub_sources.length < step.sub_sources.length && (
                        <p className="mt-0.5 text-[10px] text-purple-600 dark:text-purple-400">
                          ✓ Agent will focus on {step.selected_sub_sources.length} of {step.sub_sources.length} sources
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={step.description}
                      onChange={(e) => onUpdateStep?.(step.step_id, { description: e.target.value })}
                      maxLength={80}
                      className="w-full text-xs px-2 py-1.5 rounded border border-separator dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`task-${step.step_id}`}
                      className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1"
                    >
                      Agent question:
                    </label>
                    <textarea
                      id={`task-${step.step_id}`}
                      aria-label="Agent question"
                      value={step.task}
                      onChange={(e) => onUpdateStep?.(step.step_id, { task: e.target.value })}
                      rows={2}
                      className="w-full text-xs px-2 py-1.5 rounded border border-separator dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add step */}
      <button
        onClick={() => onAddStep?.()}
        className="mb-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
      >
        + Add step
      </button>

      {/* Optional constraints */}
      <div className="mb-3">
        <textarea
          value={userConstraints}
          onChange={(e) => onSetConstraints?.(e.target.value)}
          rows={1}
          placeholder="Add constraints or scope (optional) — applied to every agent step"
          className="w-full text-xs px-2 py-1.5 rounded border border-separator dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
        />
        {userConstraints?.trim() && (
          <p className="mt-0.5 text-[10px] text-green-600 dark:text-green-400">
            ✓ Constraint will be sent to every agent step
          </p>
        )}
      </div>

      {/* Inline regenerate feedback field */}
      {showRegenerateInput && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={regenerateFeedback}
            onChange={(e) => setRegenerateFeedback(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRegenerateSubmit()}
            placeholder="What should be different? (optional)"
            autoFocus
            className="flex-1 text-xs px-2 py-1.5 rounded border border-separator dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button
            onClick={handleRegenerateSubmit}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            Go
          </button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onApprove?.()}
          disabled={editedSteps.length === 0 || hasIncompleteSteps}
          title={hasIncompleteSteps ? "Each step needs an agent and a question" : undefined}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Run Analysis
        </button>

        <button
          onClick={() => {
            if (showRegenerateInput) {
              handleRegenerateSubmit();
            } else {
              setShowRegenerateInput(true);
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Regenerate
        </button>

        <button
          onClick={() => onReject?.()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-600 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
        >
          ✕ Reject
        </button>

        <button
          onClick={() => onSkip?.()}
          className="ml-auto text-xs text-blue-600 hover:underline dark:text-blue-400 transition-colors"
        >
          Skip Plan →
        </button>
      </div>
    </div>
  );
};

export default AnalysisPlan;
