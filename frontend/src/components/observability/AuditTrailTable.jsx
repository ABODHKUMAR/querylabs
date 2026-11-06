import { useState, useEffect, useCallback } from 'react';
import { baseURL } from '../../api/api';
import ExecutionWaterfall from './ExecutionWaterfall';

const PAGE_SIZE = 20;

const OUTCOME_COLORS = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partial:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  failed:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

function OutcomeBadge({ outcome }) {
  const cls = OUTCOME_COLORS[outcome] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {outcome ?? '—'}
    </span>
  );
}

function truncate(str, n) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function formatTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const AuditTrailTable = ({ initialAgent = null }) => {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(0);
  const [selectedTrace, setSelectedTrace] = useState(null);

  // filters
  const [agentFilter, setAgentFilter]     = useState(initialAgent ?? '');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [fromDate, setFromDate]           = useState('');
  const [toDate, setToDate]               = useState('');
  const [search, setSearch]               = useState('');

  // agent name options built from loaded rows
  const [agentOptions, setAgentOptions] = useState([]);

  const fetchRows = useCallback(async (pg) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', PAGE_SIZE);
    params.set('offset', pg * PAGE_SIZE);
    if (agentFilter)   params.set('agent_name', agentFilter);
    if (outcomeFilter) params.set('outcome', outcomeFilter);
    if (fromDate)      params.set('from_date', new Date(fromDate).toISOString());
    if (toDate)        params.set('to_date', new Date(toDate + 'T23:59:59').toISOString());

    try {
      const r = await fetch(`${baseURL}/runs?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let data = await r.json();
      if (search) {
        const q = search.toLowerCase();
        data = data.filter(row =>
          (row.question_snippet ?? '').toLowerCase().includes(q) ||
          (row.agent_name ?? '').toLowerCase().includes(q) ||
          (row.user_id ?? '').toLowerCase().includes(q)
        );
      }
      setRows(data);
      setTotal(data.length + pg * PAGE_SIZE + (data.length === PAGE_SIZE ? 1 : 0));
      setAgentOptions(prev => {
        const combined = new Set([...prev, ...data.map(d => d.agent_name).filter(Boolean)]);
        return [...combined].sort();
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [agentFilter, outcomeFilter, fromDate, toDate, search]);

  useEffect(() => {
    setPage(0);
    fetchRows(0);
  }, [agentFilter, outcomeFilter, fromDate, toDate, search]);

  useEffect(() => {
    if (initialAgent) setAgentFilter(initialAgent);
  }, [initialAgent]);

  const goPage = (dir) => {
    const next = page + dir;
    if (next < 0) return;
    setPage(next);
    fetchRows(next);
  };

  const start = page * PAGE_SIZE + 1;
  const end   = page * PAGE_SIZE + rows.length;

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Agent</label>
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="border border-separator dark:border-gray-700 rounded px-2 py-1.5 text-sm text-text-primary dark:text-gray-200 bg-white dark:bg-dark-surface focus:outline-none focus:border-brand-blue"
          >
            <option value="">All agents</option>
            {agentOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Outcome</label>
          <select
            value={outcomeFilter}
            onChange={e => setOutcomeFilter(e.target.value)}
            className="border border-separator dark:border-gray-700 rounded px-2 py-1.5 text-sm text-text-primary dark:text-gray-200 bg-white dark:bg-dark-surface focus:outline-none focus:border-brand-blue"
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-separator dark:border-gray-700 rounded px-2 py-1.5 text-sm text-text-primary dark:text-gray-200 bg-white dark:bg-dark-surface focus:outline-none focus:border-brand-blue"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">To</label>
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-separator dark:border-gray-700 rounded px-2 py-1.5 text-sm text-text-primary dark:text-gray-200 bg-white dark:bg-dark-surface focus:outline-none focus:border-brand-blue"
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs text-text-secondary">Search</label>
          <input
            type="text"
            placeholder="Search question, agent, user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-separator dark:border-gray-700 rounded px-2 py-1.5 text-sm text-text-primary dark:text-gray-200 bg-white dark:bg-dark-surface focus:outline-none focus:border-brand-blue"
          />
        </div>

        {(agentFilter || outcomeFilter || fromDate || toDate || search) && (
          <button
            onClick={() => { setAgentFilter(''); setOutcomeFilter(''); setFromDate(''); setToDate(''); setSearch(''); }}
            className="text-xs text-text-secondary hover:text-text-primary py-1.5 underline self-end"
          >
            Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 px-4 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm rounded-lg flex items-center gap-3">
          <span className="flex-1">Failed to load — {error}</span>
          <button onClick={() => fetchRows(page)} className="underline hover:no-underline font-medium shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto border border-separator rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface border-b border-separator">
              {['Timestamp','User','Agent','Skill','Question','Outcome','Tools','Tokens','Cost','Duration'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-text-secondary whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-separator animate-pulse">
                {Array.from({ length: 10 }).map((__, ci) => (
                  <td key={ci} className="px-3 py-3">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded" style={{ width: ci === 4 ? '80%' : ci === 0 ? '70%' : '50%' }} />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-10 text-text-secondary text-sm">
                  No runs found.
                </td>
              </tr>
            )}
            {!loading && rows.map((row, i) => (
              <tr
                key={row.id ?? row.trace_id ?? i}
                onClick={() => setSelectedTrace(row.trace_id)}
                className="border-b border-separator hover:bg-surface cursor-pointer transition-colors last:border-0"
              >
                <td className="px-3 py-2 whitespace-nowrap text-text-secondary text-xs">{formatTs(row.created_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-primary">{truncate(row.user_id, 16)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-primary font-medium">{row.agent_name ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{row.skill_name ?? row.skill_type ?? '—'}</td>
                <td className="px-3 py-2 max-w-[220px] text-text-primary">{truncate(row.question_snippet, 60)}</td>
                <td className="px-3 py-2 whitespace-nowrap"><OutcomeBadge outcome={row.outcome} /></td>
                <td className="px-3 py-2 whitespace-nowrap text-text-primary text-right">{row.tool_calls ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-primary text-right">{row.total_tokens ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-text-primary text-right">
                  {row.estimated_cost_usd != null ? `$${row.estimated_cost_usd.toFixed(4)}` : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-text-primary text-right">
                  {row.duration_ms != null ? `${row.duration_ms}ms` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-text-secondary">
        <span>{rows.length > 0 ? `${start}–${end} results` : '0 results'}</span>
        <div className="flex gap-2">
          <button
            onClick={() => goPage(-1)}
            disabled={page === 0}
            className="px-3 py-1 border border-separator rounded text-sm disabled:opacity-40 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            ← Prev
          </button>
          <button
            onClick={() => goPage(1)}
            disabled={rows.length < PAGE_SIZE}
            className="px-3 py-1 border border-separator rounded text-sm disabled:opacity-40 hover:border-brand-blue hover:text-brand-blue transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Waterfall drawer */}
      {selectedTrace && (
        <ExecutionWaterfall
          traceId={selectedTrace}
          onClose={() => setSelectedTrace(null)}
        />
      )}
    </div>
  );
};

export default AuditTrailTable;
