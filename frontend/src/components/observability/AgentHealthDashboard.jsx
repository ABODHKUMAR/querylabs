import { useState, useEffect } from 'react';
import { baseURL } from '../../api/api';
import { formatSourceLabel } from '../../ql-design/sourceDisplayNames';

function formatRelativeTime(isoString) {
  if (!isoString) return 'never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getRag(agent) {
  if (agent.total_runs == null || agent.total_runs === 0) {
    return { label: 'No Data', colorClass: 'bg-gray-400' };
  }
  const rate = agent.success_rate ?? 0;
  if (rate >= 95) return { label: 'Healthy', colorClass: 'bg-green-500' };
  if (rate >= 80) return { label: 'Degraded', colorClass: 'bg-amber-400' };
  return { label: 'Critical', colorClass: 'bg-red-500' };
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-dark-surface border border-separator dark:border-gray-700 rounded-lg p-4 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16 ml-2" />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i}>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
    </div>
  );
}

function AgentCard({ agent, onAgentSelect }) {
  const rag = getRag(agent);
  const hasRuns = agent.total_runs > 0;

  return (
    <div
      className={`bg-white dark:bg-dark-surface border border-separator dark:border-gray-700 rounded-lg p-4 transition-colors ${
        hasRuns ? 'cursor-pointer hover:border-brand-blue dark:hover:border-brand-blue' : 'opacity-70'
      }`}
      onClick={() => hasRuns && onAgentSelect(agent.agent_name)}
      title={!hasRuns ? 'No runs recorded yet' : undefined}
    >
      <div className="flex justify-between items-start mb-3">
        <span className="font-semibold text-text-primary text-sm leading-snug" title={agent.agent_name}>
          {formatSourceLabel(agent.display_name || agent.agent_name)}
        </span>
        <span
          className={`${rag.colorClass} text-white text-xs font-medium px-2 py-0.5 rounded-full ml-2 shrink-0`}
        >
          {rag.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-text-secondary mb-0.5">Success Rate</p>
          <p className="text-sm font-medium text-text-primary">
            {agent.success_rate != null ? `${agent.success_rate.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-0.5">P95 Latency</p>
          <p className="text-sm font-medium text-text-primary">
            {agent.p95_duration_ms != null ? `${Math.round(agent.p95_duration_ms)}ms` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-0.5">Avg Tool Calls</p>
          <p className="text-sm font-medium text-text-primary">
            {agent.avg_tool_calls != null ? agent.avg_tool_calls.toFixed(1) : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-0.5">Total Runs</p>
          <p className="text-sm font-medium text-text-primary">
            {agent.total_runs ?? 0}
          </p>
        </div>
      </div>

      <p className="text-xs text-text-secondary">
        Last run: {formatRelativeTime(agent.last_run_at)}
      </p>
    </div>
  );
}

const AgentHealthDashboard = ({ onAgentSelect }) => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = () => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${baseURL}/runs/summary/agents`).then(r => {
        if (!r.ok) throw new Error(`Runs summary: HTTP ${r.status}`);
        return r.json();
      }),
      // Master agents (with display_name) — not every sub-source id
      fetch(`${baseURL}/agent_names`).then(r => {
        if (!r.ok) throw new Error(`Agent names: HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([runStats, agentNamesResp]) => {
        if (cancelled) return;

        const cards = agentNamesResp?.response ?? agentNamesResp ?? [];
        const cardList = Array.isArray(cards) ? cards : [];
        const displayByName = Object.fromEntries(
          cardList
            .filter((c) => c?.name)
            .map((c) => [c.name, c.display_name || formatSourceLabel(c.name)])
        );

        const merged = runStats.map((row) => ({
          ...row,
          display_name: displayByName[row.agent_name] || formatSourceLabel(row.agent_name),
        }));
        const seenNames = new Set(runStats.map((a) => a.agent_name));

        cardList.forEach((card) => {
          const name = typeof card === 'string' ? card : card?.name;
          if (!name || seenNames.has(name)) return;
          merged.push({
            agent_name: name,
            display_name: (typeof card === 'object' && card.display_name) || formatSourceLabel(name),
            total_runs: 0,
            success_rate: null,
            p95_duration_ms: null,
            avg_tool_calls: null,
            last_run_at: null,
          });
        });

        // Prefer agents with activity first, then A–Z by display label
        merged.sort((a, b) => {
          const ar = a.total_runs || 0;
          const br = b.total_runs || 0;
          if (ar !== br) return br - ar;
          return formatSourceLabel(a.display_name || a.agent_name)
            .localeCompare(formatSourceLabel(b.display_name || b.agent_name));
        });

        setAgents(merged);
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  };

  useEffect(() => {
    const cancel = loadData();
    return cancel;
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg">
        <span className="flex-1">
          <span className="font-medium">Failed to load agent health — </span>
          <span>{error}</span>
        </span>
        <button
          onClick={loadData}
          className="shrink-0 underline hover:no-underline font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-secondary text-sm">
        No agents registered yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {agents.map(agent => (
        <AgentCard
          key={agent.agent_name}
          agent={agent}
          onAgentSelect={onAgentSelect}
        />
      ))}
    </div>
  );
};

export default AgentHealthDashboard;
