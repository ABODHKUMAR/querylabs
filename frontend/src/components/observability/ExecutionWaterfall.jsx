import { useState, useEffect } from 'react';
import { baseURL } from '../../api/api';

const STATUS_COLOR = {
  success: 'bg-brand-blue',
  failed:  'bg-red-500',
  partial: 'bg-amber-400',
};

function SpanBar({ span, totalDuration }) {
  const total = totalDuration || 1;
  const leftPct  = (span.start_offset_ms / total) * 100;
  const widthPct = Math.max((span.duration_ms / total) * 100, 0.5);
  const barColor = STATUS_COLOR[span.status] ?? 'bg-brand-blue';

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-text-primary w-48 shrink-0 font-medium truncate" title={span.name}>
          {span.name}
        </span>
        <div className="flex-1 relative h-5 bg-surface rounded">
          <div
            className={`absolute top-0 h-full rounded ${barColor}`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
        </div>
        <span className="text-xs text-text-secondary w-16 text-right shrink-0">
          {span.duration_ms}ms
        </span>
      </div>
      {span.error && (
        <p className="text-xs text-red-500 ml-50 pl-[13rem]">{span.error}</p>
      )}
    </div>
  );
}

const ExecutionWaterfall = ({ traceId, onClose }) => {
  const [spans, setSpans]   = useState([]);
  const [run, setRun]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const loadSpans = () => {
    if (!traceId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSpans([]);
    setRun(null);

    Promise.all([
      fetch(`${baseURL}/runs/${traceId}/spans`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      fetch(`${baseURL}/runs/${traceId}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    ])
      .then(([spansData, runData]) => {
        if (!cancelled) { setSpans(spansData); setRun(runData); setLoading(false); }
      })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });

    return () => { cancelled = true; };
  };

  useEffect(() => {
    const cancel = loadSpans();
    return cancel;
  }, [traceId]);

  const totalDuration = run?.duration_ms ?? spans.reduce((acc, s) => Math.max(acc, s.start_offset_ms + s.duration_ms), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white dark:bg-dark-surface border-l border-separator dark:border-gray-700 z-50 flex flex-col shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-separator shrink-0">
          <div>
            <p className="font-mono text-xs text-text-secondary mb-1 break-all">{traceId}</p>
            {run && (
              <p className="text-sm font-semibold text-text-primary">
                {run.agent_name}
                {run.duration_ms != null && (
                  <span className="ml-2 font-normal text-text-secondary">{run.duration_ms}ms total</span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-text-secondary hover:text-text-primary text-lg leading-none shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {loading && (
            <div className="space-y-4 mt-4 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48 shrink-0" />
                    <div className="flex-1 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm rounded-lg flex items-center gap-3">
              <span className="flex-1">Failed to load — {error}</span>
              <button onClick={loadSpans} className="underline hover:no-underline font-medium shrink-0">Retry</button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Timeline scale labels */}
              <div className="flex justify-between text-xs text-text-secondary mb-3 pl-[13rem] pr-16">
                <span>0ms</span>
                <span>{Math.round(totalDuration / 2)}ms</span>
                <span>{totalDuration}ms</span>
              </div>

              {spans.map((span, i) => (
                <SpanBar key={i} span={span} totalDuration={totalDuration} />
              ))}
            </>
          )}
        </div>

        {/* Footer summary */}
        {run && !loading && (
          <div className="px-5 py-3 border-t border-separator shrink-0 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-text-secondary">Outcome</p>
              <p className="font-medium text-text-primary capitalize">{run.outcome}</p>
            </div>
            <div>
              <p className="text-text-secondary">Tokens</p>
              <p className="font-medium text-text-primary">{run.total_tokens ?? '—'}</p>
            </div>
            <div>
              <p className="text-text-secondary">Tool Calls</p>
              <p className="font-medium text-text-primary">{run.tool_calls ?? '—'}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ExecutionWaterfall;
