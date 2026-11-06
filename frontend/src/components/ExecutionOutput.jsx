import React, { useState, useEffect, useRef } from 'react';
import { Bot, Brain, Database, CheckCircle2, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';

// ── ThoughtProcess ────────────────────────────────────────────────────────────

export const ThoughtProcess = ({ thoughts, isActive, hasResponse }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const startTimeRef = useRef(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (isActive && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    if (isActive) {
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => {
        clearInterval(interval);
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      };
    }
  }, [isActive]);

  useEffect(() => {
    if (hasResponse && !isActive) {
      const timeout = setTimeout(() => setIsExpanded(false), 500);
      return () => clearTimeout(timeout);
    }
  }, [hasResponse, isActive]);

  useEffect(() => {
    if (isActive) setIsExpanded(true);
  }, [isActive]);

  if (!thoughts || thoughts.length === 0) return null;

  const getIcon = (type) => {
    switch (type) {
      case 'agents_loaded':     return <Bot className="w-3.5 h-3.5 text-gray-400" />;
      case 'thinking':          return <Brain className="w-3.5 h-3.5 text-purple-500" />;
      case 'tool_call':         return <Database className="w-3.5 h-3.5 text-blue-500" />;
      case 'tool_result':       return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      case 'interpretation':    return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
      case 'assumptions':       return <Brain className="w-3.5 h-3.5 text-amber-500" />;
      case 'understanding':     return <Database className="w-3.5 h-3.5 text-cyan-500" />;
      case 'sql':               return <Database className="w-3.5 h-3.5 text-blue-600" />;
      case 'data':              return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
      case 'score':             return <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />;
      case 'document_search':   return <Database className="w-3.5 h-3.5 text-teal-500" />;
      case 'top_document':      return <Database className="w-3.5 h-3.5 text-emerald-500" />;
      case 'decompose':         return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
      case 'decompose_fallback':return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      case 'agent_response':    return <Bot className="w-3.5 h-3.5 text-blue-500" />;
      case 'synthesis_context': return <Brain className="w-3.5 h-3.5 text-purple-500" />;
      case 'agent_tool_trace':  return <Database className="w-3.5 h-3.5 text-slate-500" />;
      case 'sql_generated':     return <Database className="w-3.5 h-3.5 text-blue-600" />;
      case 'agent_tool_start':  return <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />;
      default:                  return <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />;
    }
  };

  const getStyle = (type) => {
    switch (type) {
      case 'thinking':          return 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800/50 dark:text-purple-300';
      case 'tool_call':         return 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'tool_result':       return 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800/50 dark:text-green-300';
      case 'interpretation':    return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-300';
      case 'assumptions':       return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
      case 'understanding':     return 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800/50 dark:text-cyan-300';
      case 'sql':               return 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'data':              return 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800/50 dark:text-green-300';
      case 'score':             return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
      case 'document_search':   return 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/20 dark:border-teal-800/50 dark:text-teal-300';
      case 'top_document':      return 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-300';
      case 'decompose':         return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-300';
      case 'decompose_fallback':return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
      case 'agent_response':    return 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'synthesis_context': return 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800/50 dark:text-purple-300';
      case 'agent_tool_trace':  return 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
      case 'sql_generated':     return 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'agent_tool_start':  return 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800/50 dark:text-cyan-300';
      default:                  return 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300';
    }
  };

  const cardTypes = ['interpretation', 'assumptions', 'understanding', 'sql', 'top_document', 'decompose', 'agent_response'];
  const badgeAllowedTypes = new Set(['agents_loaded', 'thinking', 'tool_call', 'tool_result', 'synthesis_context']);
  const cardThoughts = thoughts.filter(t => cardTypes.includes(t.type));
  const badgeThoughts = thoughts.filter(t =>
    badgeAllowedTypes.has(t.type) && !(t.type === 'synthesis_context' && t.strategy === 'passthrough')
  );

  const getContent = (thought) => {
    if (thought.type === 'synthesis_context') {
      return thought.strategy === 'passthrough'
        ? 'Passthrough'
        : `Synthesising ${thought.agents_used?.length ?? ''} agent(s)`;
    }
    if (thought.type === 'agent_tool_start') return `${thought.agent} → ${thought.label || thought.tool}`;
    return thought.content;
  };

  const renderCardBody = (thought) => {
    switch (thought.type) {
      case 'decompose': {
        const label = thought.from_plan
          ? `Using approved plan — ${thought.sub_tasks?.length ?? 0} step(s)`
          : `Decomposed into ${thought.sub_tasks?.length ?? 0} sub-task(s)`;
        return (
          <div className="w-full space-y-1">
            <div className="font-medium text-[11px]">{label}</div>
            {(thought.sub_tasks || []).map((st, i) => (
              <div key={i} className="flex flex-col gap-0.5 pl-2 border-l border-indigo-200">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">{st.agent}</span>
                  <span className="text-[11px] truncate">{st.task}</span>
                </div>
                {st.reasoning && <span className="text-[10px] italic text-indigo-500 pl-0.5">{st.reasoning}</span>}
              </div>
            ))}
          </div>
        );
      }
      case 'agent_response': {
        const meta = thought.metadata || {};
        const tracedToolCalls = thoughts.filter(t => t.type === 'agent_tool_trace' && t.agent === thought.agent).length;
        const displayToolCalls = tracedToolCalls > 0 ? tracedToolCalls : meta.tool_calls;
        return (
          <div className="w-full space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold">{thought.agent}</span>
              {thought.truncated && <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-600">truncated</span>}
            </div>
            <p className="text-[11px] line-clamp-3 break-words">{thought.answer}</p>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {meta.mcp_server && <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">{meta.mcp_server}</span>}
              {displayToolCalls != null && <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">{displayToolCalls} tool call{displayToolCalls !== 1 ? 's' : ''}</span>}
              {meta.total_tokens != null && <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">{meta.total_tokens} tokens</span>}
            </div>
          </div>
        );
      }
      case 'agent_tool_trace': {
        const argsStr = thought.args ? JSON.stringify(thought.args).slice(0, 120) : '';
        return (
          <div className="w-full space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold font-mono">#{thought.seq} {thought.tool}</span>
              {thought.truncated && <span className="px-1 py-0.5 rounded text-[10px] bg-slate-200 text-slate-500">truncated</span>}
            </div>
            {argsStr && <code className="block text-[10px] font-mono break-all line-clamp-2 group-hover:line-clamp-none bg-slate-100 rounded px-1.5 py-1">{argsStr}</code>}
            {thought.result && <p className="text-[11px] line-clamp-2 group-hover:line-clamp-none break-words">{thought.result}</p>}
          </div>
        );
      }
      case 'sql_generated': {
        return (
          <div className="w-full space-y-1">
            <div className="text-[11px] font-semibold">#{thought.seq} SQL — {thought.agent}</div>
            <code className="block text-[10px] font-mono break-all line-clamp-4 group-hover:line-clamp-none bg-blue-100 rounded px-1.5 py-1">{thought.sql}</code>
          </div>
        );
      }
      default:
        return thought.type === 'sql'
          ? <code className="text-xs font-mono break-all line-clamp-2 group-hover:line-clamp-none">{thought.content}</code>
          : <span className="break-words line-clamp-2 group-hover:line-clamp-none">{thought.content}</span>;
    }
  };

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div className="mb-3 transition-all duration-300">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-lg transition-all duration-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        </span>
        <Brain className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-purple-500' : 'text-gray-500'}`} />
        <span className="flex-1 text-left">
          {isActive ? <>Thinking...</> : <>Thought for {formatTime(elapsedTime)}</>}
        </span>
        {isActive && (
          <span className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
            </span>
          </span>
        )}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {thoughts.length} step{thoughts.length !== 1 ? 's' : ''}
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}`}>
        <div className="bg-surface border border-separator rounded-lg p-3 space-y-2">
          {badgeThoughts.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {badgeThoughts.map((thought, idx) => (
                <div
                  key={`badge-${idx}`}
                  title={thought.content}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition-all cursor-help ${getStyle(thought.type)} ${
                    idx === badgeThoughts.length - 1 && isActive && cardThoughts.length === 0 ? 'animate-pulse ring-2 ring-offset-1 ring-purple-300' : ''
                  }`}
                >
                  {getIcon(thought.type)}
                  <span className="max-w-[180px] truncate">{getContent(thought)}</span>
                </div>
              ))}
            </div>
          )}
          {cardThoughts.length > 0 && (
            <div className="space-y-1.5">
              {cardThoughts.map((thought, idx) => (
                <div
                  key={`card-${idx}`}
                  title={thought.content}
                  className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-xs transition-all cursor-help group hover:shadow-md ${getStyle(thought.type)} ${
                    idx === cardThoughts.length - 1 && isActive ? 'ring-2 ring-offset-1 ring-purple-300' : ''
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">{getIcon(thought.type)}</div>
                  <div className="flex-1 min-w-0 relative">{renderCardBody(thought)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── ExecutionTrace ────────────────────────────────────────────────────────────

export const ExecutionTrace = ({ thoughts, isActive }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());

  const tier1 = (thoughts || []).filter(t => t.type === 'agent_tool_trace' || t.type === 'sql_generated');

  useEffect(() => {
    if (isActive && tier1.length > 0) setIsExpanded(true);
  }, [isActive, tier1.length]);

  if (tier1.length === 0) return null;

  const toolCallCount = tier1.filter(t => t.type === 'agent_tool_trace').length;

  const toggleItem = (idx) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const buildArgPills = (args) => {
    if (!args || typeof args !== 'object') return [];
    return Object.entries(args).map(([k, v]) => {
      const val = typeof v === 'string' ? `${v.slice(0, 40)}${v.length > 40 ? '…' : ''}` : JSON.stringify(v).slice(0, 40);
      return { key: k, val };
    });
  };

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-lg transition-colors bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300">Tool calls</span>
        {isActive && (
          <span className="relative flex h-2 w-2 ml-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-gray-400 dark:text-gray-500">
          {toolCallCount} call{toolCallCount !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1.5 space-y-1.5">
          {tier1.map((t, idx) => {
            const open = expandedItems.has(idx);
            const stepNum = String(idx + 1).padStart(2, '0');
            const isRunning = isActive && !t.result;

            if (t.type === 'agent_tool_trace') {
              const pills = buildArgPills(t.args);
              const argsFormatted = t.args ? JSON.stringify(t.args, null, 2) : '';
              const firstDesc = t.agent ? `via ${t.agent}` : '';
              return (
                <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                  <button onClick={() => toggleItem(idx)} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold leading-none select-none ${isRunning ? 'border-2 border-blue-400 text-blue-400 animate-pulse bg-white dark:bg-gray-900' : 'bg-blue-600 text-white'}`}>
                        {stepNum}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-mono text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate">{t.tool}</span>
                        {firstDesc && <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{firstDesc}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {t.truncated && <span className="font-mono text-[10px] text-gray-400">truncated</span>}
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                        <ChevronDown className="w-3 h-3 text-gray-300 transition-transform duration-150" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                      </div>
                    </div>
                    {pills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-8">
                        {pills.map(({ key, val }) => (
                          <span key={key} className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                            <span className="text-blue-600 dark:text-blue-400">{key}</span>
                            <span className="text-gray-400 mx-0.5">=</span>
                            <span>{val}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                  {open && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {argsFormatted && (
                        <div className="px-4 pt-2.5 pb-2">
                          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Input</p>
                          <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{argsFormatted}</pre>
                        </div>
                      )}
                      {t.result && (
                        <div className="px-4 pt-1 pb-2.5">
                          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Output</p>
                          <p className="text-[11px] font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words leading-relaxed">{t.result}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (t.type === 'sql_generated') {
              const firstSqlLine = (t.sql || '').split('\n')[0].trim().slice(0, 60);
              return (
                <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 border-l-2 border-l-blue-500 bg-white dark:bg-gray-900 overflow-hidden">
                  <button onClick={() => toggleItem(idx)} className="w-full text-left px-3 py-2.5 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold leading-none select-none bg-blue-600 text-white">{stepNum}</div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12px] font-semibold text-gray-800 dark:text-gray-100">generate_sql</span>
                          <span className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">SQL</span>
                        </div>
                        {firstSqlLine && <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate mt-0.5">{firstSqlLine}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                        <ChevronDown className="w-3 h-3 text-gray-300 transition-transform duration-150" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-gray-100 dark:border-gray-800 px-4 pt-2.5 pb-2.5">
                      <p className="text-[10px] font-mono font-semibold text-blue-500 uppercase tracking-wider mb-1.5">SQL</p>
                      <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2.5 overflow-x-auto whitespace-pre leading-relaxed">{t.sql}</pre>
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
};

// ── InsightsPanel ─────────────────────────────────────────────────────────────

export const InsightsPanel = ({ insights }) => {
  if (!insights || insights.length === 0) return null;

  const getInsightIcon = (type) => {
    switch (type) {
      case 'interpretation': return <Brain className="w-4 h-4 text-indigo-600" />;
      case 'assumptions':    return <CheckCircle2 className="w-4 h-4 text-amber-600" />;
      case 'understanding':  return <Database className="w-4 h-4 text-cyan-600" />;
      case 'sql':            return <Database className="w-4 h-4 text-blue-600" />;
      case 'data':           return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'groundness':
      case 'correctness':    return <Brain className="w-4 h-4 text-purple-600" />;
      case 'vector':         return <Database className="w-4 h-4 text-indigo-600" />;
      default:               return <Loader2 className="w-4 h-4 text-gray-600" />;
    }
  };

  const getInsightStyle = (type) => {
    switch (type) {
      case 'interpretation': return 'bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50';
      case 'assumptions':    return 'bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50';
      case 'understanding':  return 'bg-cyan-50 border-cyan-100 dark:bg-cyan-900/20 dark:border-cyan-800/50';
      case 'sql':            return 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800/50';
      case 'data':           return 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800/50';
      default:               return 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700';
    }
  };

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800/50';
    if (score >= 6) return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800/50';
    if (score >= 4) return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800/50';
    return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800/50';
  };

  const scoreInsights = insights.filter(i => i.type === 'groundness' || i.type === 'correctness');
  const interpretationInsight = insights.find(i => i.type === 'interpretation');
  const assumptionsInsight = insights.find(i => i.type === 'assumptions');
  const understandingInsight = insights.find(i => i.type === 'understanding');
  const otherInsights = insights.filter(i => !['groundness', 'correctness', 'interpretation', 'assumptions', 'understanding'].includes(i.type));

  return (
    <div className="mb-3 space-y-2 animate-in fade-in duration-300">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Query Insights</span>
      </div>
      {interpretationInsight && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${getInsightStyle('interpretation')}`}>
          <div className="flex-shrink-0 mt-0.5">{getInsightIcon('interpretation')}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">{interpretationInsight.title}</div>
            <div className="text-indigo-600 dark:text-indigo-400">{interpretationInsight.content}</div>
          </div>
        </div>
      )}
      {assumptionsInsight && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${getInsightStyle('assumptions')}`}>
          <div className="flex-shrink-0 mt-0.5">{getInsightIcon('assumptions')}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-700 dark:text-amber-300 mb-0.5">{assumptionsInsight.title}</div>
            <div className="text-amber-600 dark:text-amber-400">{assumptionsInsight.content}</div>
          </div>
        </div>
      )}
      {understandingInsight && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${getInsightStyle('understanding')}`}>
          <div className="flex-shrink-0 mt-0.5">{getInsightIcon('understanding')}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-cyan-700 dark:text-cyan-300 mb-0.5">{understandingInsight.title}</div>
            <div className="text-cyan-600 dark:text-cyan-400">{understandingInsight.content}</div>
          </div>
        </div>
      )}
      {scoreInsights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scoreInsights.map((insight, idx) => (
            <div key={idx} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${getScoreColor(insight.score)}`}>
              {getInsightIcon(insight.type)}
              <span>{insight.title}:</span>
              <span>{insight.content}</span>
            </div>
          ))}
        </div>
      )}
      {otherInsights.length > 0 && (
        <div className="space-y-1.5">
          {otherInsights.map((insight, idx) => (
            <div key={idx} className={`flex items-start gap-2 text-xs rounded-lg p-2 border ${getInsightStyle(insight.type)}`}>
              <div className="flex-shrink-0 mt-0.5">{getInsightIcon(insight.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-700 dark:text-gray-300">{insight.title}</div>
                <div className="text-gray-600 dark:text-gray-400 break-all">
                  {insight.type === 'sql'
                    ? <code className="text-xs bg-white/50 dark:bg-black/20 px-1 py-0.5 rounded font-mono text-blue-700 dark:text-blue-300">{insight.content}</code>
                    : insight.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
