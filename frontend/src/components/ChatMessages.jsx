import React, {
  useEffect,
  useState,
  forwardRef,
  useCallback,
  useRef,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ArrowDown, User, Bot, Brain, Database, CheckCircle2, Loader2, Copy, Check, ChevronDown, RotateCcw, ThumbsUp, ThumbsDown, AlertTriangle, BarChart2 } from "lucide-react";
import { AccordionExpandDefault } from "../tables/AccordionExpandDefault";
import { TableDataSet } from "../tables/TableDataSet";
import PlotlyChartSet from "../tables/PlotlyChartSet";
import MarkdownRenderer from "./MarkdownRenderer";
import { postFeedback } from "../api/api";
import AnalysisPlan from "./AnalysisPlan";
import './ChatMessages.css';

// Component to display the thought process during streaming - COLLAPSIBLE
const ThoughtProcess = ({ thoughts, isActive, hasResponse }) => {
  // Auto-expand when active, auto-collapse when response arrives
  const [isExpanded, setIsExpanded] = useState(false);
  const startTimeRef = useRef(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Track elapsed time while active
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
        // Capture final elapsed time when streaming ends
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      };
    }
  }, [isActive]);
  
  // Auto-collapse when response arrives (streaming ends)
  useEffect(() => {
    if (hasResponse && !isActive) {
      // Small delay before collapsing for smoother UX
      const timeout = setTimeout(() => {
        setIsExpanded(false);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [hasResponse, isActive]);
  
  // Auto-expand when becomes active again
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);
  
  if (!thoughts || thoughts.length === 0) return null;
  
  const getIcon = (type) => {
    switch (type) {
      case 'agents_loaded':
        return <Bot className="w-3.5 h-3.5 text-gray-400" />;
      case 'thinking':
        return <Brain className="w-3.5 h-3.5 text-purple-500" />;
      case 'tool_call':
        return <Database className="w-3.5 h-3.5 text-blue-500" />;
      case 'tool_result':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      case 'interpretation':
        return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
      case 'assumptions':
        return <Brain className="w-3.5 h-3.5 text-amber-500" />;
      case 'understanding':
        return <Database className="w-3.5 h-3.5 text-cyan-500" />;
      case 'sql':
        return <Database className="w-3.5 h-3.5 text-blue-600" />;
      case 'data':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
      case 'score':
        return <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />;
      // Vector tool types
      case 'document_search':
        return <Database className="w-3.5 h-3.5 text-teal-500" />;
      case 'top_document':
        return <Database className="w-3.5 h-3.5 text-emerald-500" />;
      // White-box event types
      case 'decompose':
        return <Brain className="w-3.5 h-3.5 text-indigo-500" />;
      case 'decompose_fallback':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      case 'agent_response':
        return <Bot className="w-3.5 h-3.5 text-blue-500" />;
      case 'synthesis_context':
        return <Brain className="w-3.5 h-3.5 text-purple-500" />;
      case 'agent_tool_trace':
        return <Database className="w-3.5 h-3.5 text-slate-500" />;
      case 'sql_generated':
        return <Database className="w-3.5 h-3.5 text-blue-600" />;
      case 'agent_tool_start':
        return <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />;
      default:
        return <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />;
    }
  };
  
  const getStyle = (type) => {
    switch (type) {
      case 'thinking':
        return 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800/50 dark:text-purple-300';
      case 'tool_call':
        return 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'tool_result':
        return 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800/50 dark:text-green-300';
      case 'interpretation':
        return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-300';
      case 'assumptions':
        return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
      case 'understanding':
        return 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800/50 dark:text-cyan-300';
      case 'sql':
        return 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'data':
        return 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800/50 dark:text-green-300';
      case 'score':
        return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
      case 'document_search':
        return 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/20 dark:border-teal-800/50 dark:text-teal-300';
      case 'top_document':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/50 dark:text-emerald-300';
      // White-box event types
      case 'decompose':
        return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:text-indigo-300';
      case 'decompose_fallback':
        return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300';
      case 'agent_response':
        return 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'synthesis_context':
        return 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800/50 dark:text-purple-300';
      case 'agent_tool_trace':
        return 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
      case 'sql_generated':
        return 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800/50 dark:text-blue-300';
      case 'agent_tool_start':
        return 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-900/20 dark:border-cyan-800/50 dark:text-cyan-300';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300';
    }
  };
  
  // Separate card-style thoughts from badge-style
  const cardTypes = [
    'interpretation', 'assumptions', 'understanding', 'sql', 'top_document',
    'decompose', 'agent_response',
  ];
  // Only show high-level lifecycle badges; granular tool traces are in ExecutionTrace
  const badgeAllowedTypes = new Set([
    'agents_loaded', 'thinking', 'tool_call', 'tool_result', 'synthesis_context',
  ]);
  const cardThoughts = thoughts.filter(t => cardTypes.includes(t.type));
  const badgeThoughts = thoughts.filter(t =>
    badgeAllowedTypes.has(t.type) &&
    !(t.type === 'synthesis_context' && t.strategy === 'passthrough')
  );
  
  const getContent = (thought) => {
    if (thought.type === 'synthesis_context') {
      return thought.strategy === 'passthrough'
        ? 'Passthrough'
        : `Synthesising ${thought.agents_used?.length ?? ''} agent(s)`;
    }
    if (thought.type === 'agent_tool_start') {
      return `${thought.agent} → ${thought.label || thought.tool}`;
    }
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
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                    {st.agent}
                  </span>
                  <span className="text-[11px] truncate">{st.task}</span>
                </div>
                {st.reasoning && (
                  <span className="text-[10px] italic text-indigo-500 pl-0.5">{st.reasoning}</span>
                )}
              </div>
            ))}
          </div>
        );
      }

      case 'agent_response': {
        const meta = thought.metadata || {};
        const tracedToolCalls = thoughts.filter(
          t => t.type === 'agent_tool_trace' && t.agent === thought.agent
        ).length;
        const displayToolCalls = tracedToolCalls > 0 ? tracedToolCalls : meta.tool_calls;
        return (
          <div className="w-full space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold">{thought.agent}</span>
              {thought.truncated && (
                <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-600">truncated</span>
              )}
            </div>
            <p className="text-[11px] line-clamp-3 break-words">{thought.answer}</p>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {meta.mcp_server && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">{meta.mcp_server}</span>
              )}
              {displayToolCalls != null && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">
                  {displayToolCalls} tool call{displayToolCalls !== 1 ? 's' : ''}
                </span>
              )}
              {meta.total_tokens != null && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">
                  {meta.total_tokens} tokens
                </span>
              )}
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
              {thought.truncated && (
                <span className="px-1 py-0.5 rounded text-[10px] bg-slate-200 text-slate-500">truncated</span>
              )}
            </div>
            {argsStr && (
              <code className="block text-[10px] font-mono break-all line-clamp-2 group-hover:line-clamp-none bg-slate-100 rounded px-1.5 py-1">
                {argsStr}
              </code>
            )}
            {thought.result && (
              <p className="text-[11px] line-clamp-2 group-hover:line-clamp-none break-words">
                {thought.result}
              </p>
            )}
          </div>
        );
      }

      case 'sql_generated': {
        return (
          <div className="w-full space-y-1">
            <div className="text-[11px] font-semibold">#{thought.seq} SQL — {thought.agent}</div>
            <code className="block text-[10px] font-mono break-all line-clamp-4 group-hover:line-clamp-none bg-blue-100 rounded px-1.5 py-1">
              {thought.sql}
            </code>
          </div>
        );
      }

      default:
        return thought.type === 'sql'
          ? <code className="text-xs font-mono break-all line-clamp-2 group-hover:line-clamp-none">{thought.content}</code>
          : <span className="break-words line-clamp-2 group-hover:line-clamp-none">{thought.content}</span>;
    }
  };

  // Format time display
  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };
  
  return (
    <div className="mb-3 transition-all duration-300">
      {/* Collapsible Header - subtle styling, no yellow */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-lg transition-all duration-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        {/* Expand/Collapse Icon */}
        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        </span>
        
        <Brain className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-purple-500' : 'text-gray-500'}`} />
        
        <span className="flex-1 text-left">
          {isActive ? (
            <>Thinking...</>
          ) : (
            <>Thought for {formatTime(elapsedTime)}</>
          )}
        </span>
        
        {/* Processing indicator when active - subtle purple instead of yellow */}
        {isActive && (
          <span className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
          </span>
        )}
        
        {/* Step count badge */}
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {thoughts.length} step{thoughts.length !== 1 ? 's' : ''}
        </span>
      </button>
      
      {/* Collapsible Content - smooth transition */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
      }`}>
        <div className="bg-surface border border-separator rounded-lg p-3 space-y-2">
          {/* Badge-style thoughts (thinking, tool_call, etc.) */}
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
          
          {/* Card-style thoughts (interpretation, understanding, sql) */}
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
                  <div className="flex-shrink-0 mt-0.5">
                    {getIcon(thought.type)}
                  </div>
                  <div className="flex-1 min-w-0 relative">
                    {renderCardBody(thought)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Tier 1 execution trace — numbered step-card layout
const ExecutionTrace = ({ thoughts, isActive }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());

  const tier1 = (thoughts || []).filter(
    t => t.type === 'agent_tool_trace' || t.type === 'sql_generated'
  );

  // Must call useEffect unconditionally — before any early return
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

  // Build arg pills: [{key, val}] — truncated to 40 chars per value
  const buildArgPills = (args) => {
    if (!args || typeof args !== 'object') return [];
    return Object.entries(args).map(([k, v]) => {
      const val = typeof v === 'string'
        ? `${v.slice(0, 40)}${v.length > 40 ? '…' : ''}`
        : JSON.stringify(v).slice(0, 40);
      return { key: k, val };
    });
  };

  return (
    <div className="mb-3">
      {/* Panel header */}
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

      {/* Step card list */}
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
                  {/* Card header button — pills are inside so full card is clickable */}
                  <button
                    onClick={() => toggleItem(idx)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Task 6.1 — Blue numbered badge */}
                      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                        text-[10px] font-bold leading-none select-none
                        ${isRunning
                          ? 'border-2 border-blue-400 text-blue-400 animate-pulse bg-white dark:bg-gray-900'
                          : 'bg-blue-600 text-white'}`}>
                        {stepNum}
                      </div>
                      {/* Task 6.2 — Bold tool name + firstDesc */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-mono text-[12px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                          {t.tool}
                        </span>
                        {firstDesc && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                            {firstDesc}
                          </span>
                        )}
                      </div>
                      {/* Seq number + chevron */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {t.truncated && (
                          <span className="font-mono text-[10px] text-gray-400">truncated</span>
                        )}
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                        <ChevronDown
                          className="w-3 h-3 text-gray-300 transition-transform duration-150"
                          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                        />
                      </div>
                    </div>
                    {/* Task 6.3 — Arg pills row (inside button = full card is click target) */}
                    {pills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-8">
                        {pills.map(({ key, val }) => (
                          <span
                            key={key}
                            className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                          >
                            <span className="text-blue-600 dark:text-blue-400">{key}</span>
                            <span className="text-gray-400 mx-0.5">=</span>
                            <span>{val}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </button>

                  {/* Expanded detail */}
                  {open && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {argsFormatted && (
                        <div className="px-4 pt-2.5 pb-2">
                          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Input</p>
                          <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                            {argsFormatted}
                          </pre>
                        </div>
                      )}
                      {t.result && (
                        <div className="px-4 pt-1 pb-2.5">
                          <p className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Output</p>
                          <p className="text-[11px] font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words leading-relaxed">
                            {t.result}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (t.type === 'sql_generated') {
              // Task 6.5 — SQL card: blue left border, SQL pill, first SQL line inline
              const firstSqlLine = (t.sql || '').split('\n')[0].trim().slice(0, 60);
              return (
                <div key={idx} className="rounded-lg border border-gray-200 dark:border-gray-700 border-l-2 border-l-blue-500 bg-white dark:bg-gray-900 overflow-hidden">
                  <button
                    onClick={() => toggleItem(idx)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Blue numbered badge */}
                      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold leading-none select-none bg-blue-600 text-white">
                        {stepNum}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[12px] font-semibold text-gray-800 dark:text-gray-100">
                            generate_sql
                          </span>
                          {/* SQL pill */}
                          <span className="inline-flex items-center font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            SQL
                          </span>
                        </div>
                        {firstSqlLine && (
                          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate mt-0.5">
                            {firstSqlLine}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">#{idx + 1}</span>
                        <ChevronDown
                          className="w-3 h-3 text-gray-300 transition-transform duration-150"
                          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                        />
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-gray-100 dark:border-gray-800 px-4 pt-2.5 pb-2.5">
                      <p className="text-[10px] font-mono font-semibold text-blue-500 uppercase tracking-wider mb-1.5">SQL</p>
                      <pre className="text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded p-2.5 overflow-x-auto whitespace-pre leading-relaxed">
                        {t.sql}
                      </pre>
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

// Component to display insights (groundness, SQL preview, data info, interpretation, etc.)
const InsightsPanel = ({ insights }) => {
  if (!insights || insights.length === 0) return null;
  
  const getInsightIcon = (type) => {
    switch (type) {
      case 'interpretation':
        return <Brain className="w-4 h-4 text-indigo-600" />;
      case 'assumptions':
        return <CheckCircle2 className="w-4 h-4 text-amber-600" />;
      case 'understanding':
        return <Database className="w-4 h-4 text-cyan-600" />;
      case 'sql':
        return <Database className="w-4 h-4 text-blue-600" />;
      case 'data':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'groundness':
      case 'correctness':
        return <Brain className="w-4 h-4 text-purple-600" />;
      case 'vector':
        return <Database className="w-4 h-4 text-indigo-600" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-600" />;
    }
  };
  
  const getInsightStyle = (type) => {
    switch (type) {
      case 'interpretation':
        return 'bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50';
      case 'assumptions':
        return 'bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50';
      case 'understanding':
        return 'bg-cyan-50 border-cyan-100 dark:bg-cyan-900/20 dark:border-cyan-800/50';
      case 'sql':
        return 'bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800/50';
      case 'data':
        return 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800/50';
      default:
        return 'bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700';
    }
  };

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800/50';
    if (score >= 6) return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800/50';
    if (score >= 4) return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800/50';
    return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800/50';
  };
  
  // Group insights by type
  const scoreInsights = insights.filter(i => i.type === 'groundness' || i.type === 'correctness');
  const interpretationInsight = insights.find(i => i.type === 'interpretation');
  const assumptionsInsight = insights.find(i => i.type === 'assumptions');
  const understandingInsight = insights.find(i => i.type === 'understanding');
  const otherInsights = insights.filter(i => 
    !['groundness', 'correctness', 'interpretation', 'assumptions', 'understanding'].includes(i.type)
  );
  
  return (
    <div className="mb-3 space-y-2 animate-in fade-in duration-300">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Query Insights</span>
      </div>
      
      {/* Interpretation - What the AI understood */}
      {interpretationInsight && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${getInsightStyle('interpretation')}`}>
          <div className="flex-shrink-0 mt-0.5">
            {getInsightIcon('interpretation')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">{interpretationInsight.title}</div>
            <div className="text-indigo-600 dark:text-indigo-400">{interpretationInsight.content}</div>
          </div>
        </div>
      )}
      
      {/* Assumptions */}
      {assumptionsInsight && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${getInsightStyle('assumptions')}`}>
          <div className="flex-shrink-0 mt-0.5">
            {getInsightIcon('assumptions')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-amber-700 dark:text-amber-300 mb-0.5">{assumptionsInsight.title}</div>
            <div className="text-amber-600 dark:text-amber-400">{assumptionsInsight.content}</div>
          </div>
        </div>
      )}
      
      {/* Tables/Columns Understanding */}
      {understandingInsight && (
        <div className={`flex items-start gap-2 text-xs rounded-lg p-2.5 border ${getInsightStyle('understanding')}`}>
          <div className="flex-shrink-0 mt-0.5">
            {getInsightIcon('understanding')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-cyan-700 dark:text-cyan-300 mb-0.5">{understandingInsight.title}</div>
            <div className="text-cyan-600 dark:text-cyan-400">{understandingInsight.content}</div>
          </div>
        </div>
      )}
      
      {/* Score badges */}
      {scoreInsights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scoreInsights.map((insight, idx) => (
            <div
              key={idx}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${getScoreColor(insight.score)}`}
            >
              {getInsightIcon(insight.type)}
              <span>{insight.title}:</span>
              <span>{insight.content}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Other insights (SQL, data count, etc.) */}
      {otherInsights.length > 0 && (
        <div className="space-y-1.5">
          {otherInsights.map((insight, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 text-xs rounded-lg p-2 border ${getInsightStyle(insight.type)}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getInsightIcon(insight.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-700 dark:text-gray-300">{insight.title}</div>
                <div className="text-gray-600 dark:text-gray-400 break-all">
                  {insight.type === 'sql' ? (
                    <code className="text-xs bg-white/50 dark:bg-black/20 px-1 py-0.5 rounded font-mono text-blue-700 dark:text-blue-300">
                      {insight.content}
                    </code>
                  ) : (
                    insight.content
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SqlCodeBlock = ({ label, sql }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label || 'Generated SQL'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-surface border border-separator rounded-lg p-3 text-xs font-mono text-text-primary overflow-x-auto whitespace-pre-wrap">
        <code>{sql}</code>
      </pre>
    </div>
  );
};

const ChatMessages = forwardRef(({
  chatHistory,
  inputFocused,
  setTyping,
  speakerEnable,
  isLoadingFromHistory,
  // Streaming props
  streamingText = '',
  streamingData = null,
  isStreaming = false,
  thoughts = [],
  insights = [],
  // Interaction callbacks
  onFollowUpSubmit,
  onRegenerate,
}, ref) => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [typedResponse, setTypedResponse] = useState("");
  const [typingIndex, setTypingIndex] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [feedbackState, setFeedbackState] = useState({});
  const hasInitializedRef = useRef(false);
  const prevChatLengthRef = useRef(0);
  const processedMessageIds = useRef(new Set());
  // Snapshot of chatHistory length at first render — used to detect remounts where
  // existing messages should never re-trigger the typing animation.
  const initialChatLengthRef = useRef(chatHistory.length);
  const messagesContainerRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Typewriter animation for streaming — drains the token queue at a controlled
  // rate so chars appear smoothly even when the backend sends many tokens at once.
  const [displayedStreamingText, setDisplayedStreamingText] = useState('');
  const streamingQueueRef = useRef('');
  const streamingDrainRafRef = useRef(null);
  const lastStreamingTextLengthRef = useRef(0);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior, block: "end" });
    }
  }, [ref]);

  useEffect(() => {
    if (chatHistory.length > 0) {
      setTimeout(() => {
        scrollToBottom("auto");
      }, 50);
    }
  }, [chatHistory, scrollToBottom]);
  
  // Auto-scroll when streaming text updates
  useEffect(() => {
    if (isStreaming && streamingText) {
      console.log('[ChatMessages] Streaming text updated:', streamingText.length, 'chars');
      scrollToBottom("auto");
    }
  }, [streamingText, isStreaming, scrollToBottom]);
  
  // Debug: Log streaming props
  useEffect(() => {
    if (isStreaming) {
      console.log('[ChatMessages] Streaming props:', {
        isStreaming,
        streamingTextLength: streamingText?.length || 0,
        hasStreamingData: !!streamingData
      });
    }
  }, [isStreaming, streamingText, streamingData]);

  // Drain streaming tokens into displayedStreamingText at a controlled rate.
  // Handles both slow (token-by-token) and fast (batch) backends uniformly.
  useEffect(() => {
    // New stream starting — reset display
    if (isStreaming && streamingText === '') {
      streamingQueueRef.current = '';
      lastStreamingTextLengthRef.current = 0;
      setDisplayedStreamingText('');
      if (streamingDrainRafRef.current) {
        cancelAnimationFrame(streamingDrainRafRef.current);
        streamingDrainRafRef.current = null;
      }
      return;
    }

    // Stream ended — flush any remaining queued chars immediately
    if (!isStreaming) {
      if (streamingQueueRef.current) {
        const remaining = streamingQueueRef.current;
        streamingQueueRef.current = '';
        setDisplayedStreamingText(prev => prev + remaining);
      }
      if (streamingDrainRafRef.current) {
        cancelAnimationFrame(streamingDrainRafRef.current);
        streamingDrainRafRef.current = null;
      }
      return;
    }

    // Enqueue newly arrived chars
    const newChars = streamingText.slice(lastStreamingTextLengthRef.current);
    if (newChars) {
      streamingQueueRef.current += newChars;
      lastStreamingTextLengthRef.current = streamingText.length;
    }

    // Start drain loop if idle
    if (!streamingDrainRafRef.current && streamingQueueRef.current) {
      const drain = () => {
        const q = streamingQueueRef.current;
        if (!q) { streamingDrainRafRef.current = null; return; }
        // Adaptive chunk size: slow for small queues, faster for large ones
        const size = Math.min(Math.max(3, Math.ceil(q.length / 15)), 20);
        streamingQueueRef.current = q.slice(size);
        setDisplayedStreamingText(prev => prev + q.slice(0, size));
        streamingDrainRafRef.current = requestAnimationFrame(drain);
      };
      streamingDrainRafRef.current = requestAnimationFrame(drain);
    }
  }, [streamingText, isStreaming]);

  // Cancel drain RAF on unmount
  useEffect(() => {
    return () => {
      if (streamingDrainRafRef.current) cancelAnimationFrame(streamingDrainRafRef.current);
    };
  }, []);

  useEffect(() => {
    const adjustMessagesHeight = () => {
      const container = messagesContainerRef.current;
      if (!container) return;

      if (window.innerWidth < 1024) {
        const footerHeight =
          document.querySelector("footer")?.offsetHeight || 0;
        const headerHeight =
          document.querySelector("header")?.offsetHeight || 0;

        if (inputFocused) {
          const calculatedHeight =
            window.innerHeight - headerHeight - footerHeight - 20;
          container.style.height = `${calculatedHeight}px`;
          container.style.maxHeight = `${calculatedHeight}px`;
        } else {
          container.style.height = null;
          container.style.maxHeight = null;
        }
      } else {
        container.style.height = null;
        container.style.maxHeight = null;
      }
    };

    adjustMessagesHeight();
    window.addEventListener("resize", adjustMessagesHeight);
    return () => {
      window.removeEventListener("resize", adjustMessagesHeight);
    };
  }, [inputFocused]);

  const isAtBottom = (container) => {
    const threshold = 10;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold
    );
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom = isAtBottom(container);
      setShowScrollIndicator(!atBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

 
  useEffect(() => {
    // Skip typing animation if loading from history
    if (isLoadingFromHistory) {
      // Mark all messages as processed without animation
      chatHistory.forEach((msg) => {
        processedMessageIds.current.add(msg.timestamp);
      });
      prevChatLengthRef.current = chatHistory.length;
      hasInitializedRef.current = true;
      setTypingIndex(null);
      setTypedResponse("");
      return;
    }

    // Initial load setup
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;

      // If the component mounted with messages already in state (session restore /
      // page navigation back), mark everything as processed so no message replays
      // its typing animation.
      if (initialChatLengthRef.current > 0) {
        chatHistory.forEach(msg => processedMessageIds.current.add(msg.timestamp));
        prevChatLengthRef.current = chatHistory.length;
        return;
      }

      if (chatHistory.length === 1) {
        prevChatLengthRef.current = 0;
        const latestIndex = chatHistory.length - 1;
        const latestMsg = chatHistory[latestIndex];

        if (
          latestMsg?.response &&
          !latestMsg.error &&
          !latestMsg.wasStreamed &&
          !processedMessageIds.current.has(latestMsg.timestamp)
        ) {
          processedMessageIds.current.add(latestMsg.timestamp);
    
          const fullText = latestMsg.response.split("=======SQL Query======")[0] || "";
          if (!fullText) return;
    
          setTypedResponse("");
          if (location.pathname === "/ChatBox") {
            const previousLocation = window.history.state?.from;
            if(previousLocation === "/settings"){
              setTypingIndex(null);
            }

          }else{
            setTypingIndex(latestIndex);
          }
          
          window.speechSynthesis.cancel();
    
          const typingSpeedMs = 10;
    
          if (speakerEnable) {
            const utterance = new SpeechSynthesisUtterance(fullText);
            utterance.lang = "en-IN";
            utterance.rate = 2;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
          }
    
          let currentChar = 0;
    
          const type = () => {
            setTypedResponse(fullText.slice(0, currentChar + 1));
            currentChar++;
    
            if (currentChar < fullText.length) {
              setTimeout(type, typingSpeedMs);
            } else {
              setTypingIndex(null);
              // Ensure scroll after typing finishes
              setTimeout(() => scrollToBottom("smooth"), 50);
            }
          };
    
          // Initial scroll before typing
          scrollToBottom("auto");
          type();
        }
        
        return;
      } else {
        chatHistory.forEach((msg) => {
          processedMessageIds.current.add(msg.timestamp);
        });
        prevChatLengthRef.current = chatHistory.length;
        return;
      }      
    }
  
    // New message appended
    if (chatHistory.length > prevChatLengthRef.current) {
      const latestIndex = chatHistory.length - 1;
      const latestMsg = chatHistory[latestIndex];
  
      if (
        latestMsg?.response &&
        !latestMsg.error &&
        !latestMsg.wasStreamed &&
        !processedMessageIds.current.has(latestMsg.timestamp)
      ) {
        processedMessageIds.current.add(latestMsg.timestamp);

        const fullText = latestMsg.response.split("=======SQL Query======")[0] || "";
        if (!fullText) return;

        setTypedResponse("");
        setTypingIndex(latestIndex);
        window.speechSynthesis.cancel();
  
        const typingSpeedMs = 10;
  
        if (speakerEnable) {
          const utterance = new SpeechSynthesisUtterance(fullText);
          utterance.lang = "en-IN";
          utterance.rate = 2;
          utterance.pitch = 1;
          window.speechSynthesis.speak(utterance);
        }
  
        let currentChar = 0;
  
        const type = () => {
          setTypedResponse(fullText.slice(0, currentChar + 1));
          currentChar++;
  
          if (currentChar < fullText.length) {
            setTimeout(type, typingSpeedMs);
          } else {
            setTypingIndex(null);
            // Ensure scroll after typing finishes
            setTimeout(() => scrollToBottom("smooth"), 50);
          }
        };
  
        // Initial scroll before typing
        scrollToBottom("auto");
        type();
      }
    }
  
    prevChatLengthRef.current = chatHistory.length;
  }, [chatHistory, scrollToBottom, speakerEnable, isLoadingFromHistory]);
  
  // New effect to handle setTyping
  useEffect(() => {
    const isTyping = typingIndex !== null;
    setTyping(isTyping);
  }, [typingIndex, setTyping]);

  const formatResponse = (text, isTyping = false, tableData = [], citation = "", sql_query = "", plotlyJson={}) => {
    if (!text) return null;
    const [content] = text.split("=======SQL Query======");
    if (!content) return null;
    const lines = content.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return null;

    const header = lines[0];
    const response_content = lines.join("\n");
    const items = lines.slice(1);

    const formattedList = items.map((item, index) => {
      const [company, details] = item.split(":").map((part) => part.trim());
      return {
        company: company?.replace("- ", `${index + 1}. `),
        details,
      };
    });

    const hasSql = sql_query && typeof sql_query === 'object' && Object.keys(sql_query).length > 0;
    const sqlEntries = hasSql
      ? Object.entries(sql_query).filter(([, v]) => typeof v === 'string' && v.trim())
      : [];

    return (
      <div className="response-format-wrapper">
        {/* Section 1: Narrative text — plain text while streaming/typing to avoid
            re-parsing markdown on every token; switch to full markdown on completion. */}
        {content && (
          <div className="response-text-content">
            {isTyping ? (
              <p className="whitespace-pre-wrap text-sm text-text-primary leading-relaxed">{content}</p>
            ) : (
              <MarkdownRenderer>{content}</MarkdownRenderer>
            )}
          </div>
        )}

        {/* Section 4: Generated SQL code blocks */}
        {!isTyping && sqlEntries.map(([key, sqlText]) => (
          <div key={key}>
            <hr className="border-separator my-3" />
            <SqlCodeBlock label={sqlEntries.length > 1 ? `Generated SQL — ${key}` : 'Generated SQL'} sql={sqlText} />
          </div>
        ))}

        {/* Data / Chart accordion (table + chart tabs) */}
        <div className="response-data-container">
          {hasSql && !isTyping && (
            <>
              <hr className="border-separator my-3" />
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Data Analysis</span>
              <AccordionExpandDefault tableData={tableData} sql_query={sql_query} plotlyJson={plotlyJson} />
            </>
          )}
          {citation && citation.length > 0 && !isTyping && (
            <p className="response-citation">
              {(() => {
                const fileName = citation?.split(/[/\\]/).pop() || "";
                return fileName.length > 50 ? fileName.slice(0, 50) + "..." : fileName;
              })()}
            </p>
          )}
        </div>

        {isTyping && (
          <div className="response-typing-indicator">
            Typing...
          </div>
        )}
      </div>
    );
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if the date is today
    const isToday = date.toDateString() === today.toDateString();
    // Check if the date is yesterday
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const timeString = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    
    if (isToday) {
      return `Today at ${timeString}`;
    } else if (isYesterday) {
      return `Yesterday at ${timeString}`;
    } else {
      // Format as "Jan 20 at 2:30 PM"
      const dateString = date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
      return `${dateString} at ${timeString}`;
    }
  };

  const handleCopyResponse = useCallback((text, index) => {
    const [content] = text.split("=======SQL Query======");
    navigator.clipboard.writeText(content || text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const handleFeedback = useCallback(async (item, rating) => {
    const key = item.traceId || item.timestamp;
    if (!key || feedbackState[key]) return;
    setFeedbackState(prev => ({ ...prev, [key]: rating }));
    if (item.traceId) {
      try { await postFeedback(item.traceId, rating); } catch { /* best-effort */ }
    }
  }, [feedbackState]);

  const hasCanvasData = (item) =>
    !!(
      (item.plotlyJson && Object.keys(item.plotlyJson).length > 0) ||
      (item.artifacts && item.artifacts.some(a => ['chart', 'plotly', 'table'].includes(a.type))) ||
      (item.tableData && Object.keys(item.tableData).length > 0) ||
      (item.sql_query && Object.keys(item.sql_query).length > 0)
    );

  const renderMessage = (item, index) => {
    const isLastMessage = index === chatHistory.length - 1;
    // Show as streaming if: item marked as streaming AND (is last message OR isStreaming prop is true)
    const isStreamingMessage = item.isStreaming && isLastMessage;
    const isTypingMessage = index === typingIndex && !isStreamingMessage;
    
    // For streaming messages, show streaming text; otherwise use normal logic
    let responseText;
    if (isStreamingMessage && (isStreaming || streamingText)) {
      // Use animated display text for smooth character-by-character reveal
      responseText = displayedStreamingText || streamingText || item.response;
    } else if (isTypingMessage) {
      responseText = typedResponse;
    } else {
      responseText = item.response;
    }
    
    // For streaming, use streaming data if available
    const tableData = isStreamingMessage && streamingData?.data && Object.keys(streamingData.data).length > 0
      ? streamingData.data 
      : item?.tableData;
    const citation = item?.citation;
    const sql_query = isStreamingMessage && streamingData?.sql_query && Object.keys(streamingData.sql_query).length > 0
      ? streamingData.sql_query 
      : item?.sql_query;
    const plotlyJson = isStreamingMessage && streamingData?.chart_vis && Object.keys(streamingData.chart_vis).length > 0
      ? streamingData.chart_vis 
      : (item.plotlyJson || {});
    const dataSources = (() => {
      const names = new Set();
      (item?.thoughts || [])
        .filter(t => t.type === 'agent_tool_trace')
        .forEach(t => {
          const args = t.args || {};
          if (Array.isArray(args.table_names)) args.table_names.forEach(n => names.add(n));
          if (typeof args.collection_name === 'string' && args.collection_name) names.add(args.collection_name);
        });
      return names.size > 0 ? [...names] : (item?.dataSources || []);
    })();

    return (
      <div key={index} className="chat-messages-container">
        <div className="user-message-wrapper">
          <div className="user-avatar">
            <div className="user-avatar-circle">
              <User className="user-avatar-icon" />
            </div>
          </div>
          <div className="user-message-content">
            <div className="user-message-bubble">
              <p className="user-message-text">{item.query}</p>
            </div>
            <span className="message-timestamp">
              {formatTime(item.timestamp)}
            </span>
          </div>
        </div>

        <div
          className="assistant-message-wrapper"
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <div className="assistant-avatar">
            <div className="assistant-avatar-circle">
              <Bot className="assistant-avatar-icon" />
            </div>
          </div>
          <div className="assistant-message-content">
            <div className="assistant-message-bubble transition-all duration-300">
              {/* AnalysisPlan — collapsed snapshot for history messages */}
              {!isLastMessage && item.planSnapshot && (
                <AnalysisPlan
                  planState={{
                    phase: 'complete',
                    editedSteps: item.planSnapshot.editedSteps || [],
                    stepStatuses: item.planSnapshot.stepStatuses || {},
                    plan: null,
                    userConstraints: '',
                    error: null,
                  }}
                  onUpdateStep={() => {}} onRemoveStep={() => {}} onReorderSteps={() => {}}
                  onSetConstraints={() => {}} onApprove={() => {}} onReject={() => {}}
                  onSkip={() => {}} onRegenerate={() => {}} onRetryPlan={() => {}} onContinuePartial={() => {}}
                  isLastMessage={false}
                />
              )}
              {/* Show thought process - from streaming OR saved in item */}
              {(() => {
                const displayThoughts = (isStreamingMessage && thoughts && thoughts.length > 0)
                  ? thoughts
                  : (item.thoughts && item.thoughts.length > 0 ? item.thoughts : null);
                if (!displayThoughts) return null;
                return (
                  <>
                    <ThoughtProcess
                      thoughts={displayThoughts}
                      isActive={isStreamingMessage && isStreaming && !responseText}
                      hasResponse={!!responseText}
                    />
                    <ExecutionTrace
                      thoughts={displayThoughts}
                      isActive={isStreamingMessage && isStreaming}
                    />
                  </>
                );
              })()}

              {/* Show insights (groundness, SQL preview, data info) */}
              {isStreamingMessage && insights && insights.length > 0 && (
                <InsightsPanel insights={insights} />
              )}

              {item.error ? (
                <div className="error-message">
                  <X className="error-icon" />
                  {item.error}
                </div>
              ) : responseText ? (
                <>
                  {formatResponse(responseText, isTypingMessage || (isStreamingMessage && isStreaming), tableData, citation, sql_query, plotlyJson)}
                  {/* Render A2A artifacts (tables and charts) from agent responses */}
                  {(item.artifacts || []).length > 0 && !isStreamingMessage && (
                    <div className="mt-3 space-y-3">
                      {item.artifacts.map((artifact, idx) => {
                        if (artifact.type === "table" && Array.isArray(artifact.data) && artifact.data.length > 0) {
                          return (
                            <div key={idx}>
                              {artifact.title && (
                                <p className="text-xs font-medium text-gray-500 mb-1">{artifact.title}</p>
                              )}
                              <TableDataSet tableData={artifact.data} />
                            </div>
                          );
                        }
                        if (artifact.type === "chart" || artifact.type === "plotly") {
                          return null; // Charts are shown in the Chart tab only
                        }
                        return null;
                      })}
                    </div>
                  )}
                </>
              ) : (isStreamingMessage && isStreaming) ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>Generating response...</span>
                </div>
              ) : item.isPlanPending ? (
                null
              ) : (
                <span className="no-response-message">
                  No response data available
                </span>
              )}

              {/* Source citations */}
              {dataSources.length > 0 && !item.error && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-separator flex-wrap">
                  <span className="text-xs text-text-secondary shrink-0">Sources:</span>
                  {dataSources.map((source, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs text-text-secondary bg-[#f5f5f7] dark:bg-gray-800 border border-separator dark:border-gray-700"
                    >
                      {source}
                    </span>
                  ))}
                </div>
              )}

              {/* Follow-up question chips — only on the last completed message */}
              {isLastMessage && !isStreamingMessage && !item.error &&
                Array.isArray(item.followUpQuestions) && item.followUpQuestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-separator">
                  {item.followUpQuestions.map((q, qi) => (
                    <button
                      key={qi}
                      onClick={() => onFollowUpSubmit?.(q)}
                      className="px-3 py-1.5 text-xs text-text-primary dark:text-gray-200 bg-white dark:bg-dark-surface border border-[#e8e8ed] dark:border-gray-700 rounded-full hover:border-[#0071e3] hover:text-[#0071e3] dark:hover:border-brand-blue dark:hover:text-brand-blue transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Message action bar — appears on hover for completed bot messages */}
              {hoveredIndex === index && !item.error && responseText && !isStreamingMessage && (
                <div className="flex items-center justify-end gap-0.5 mt-2 pt-2 border-t border-separator">
                  {hasCanvasData(item) && (
                    <button
                      onClick={() => navigate('/canvas', { state: { message: item, chatHistory, messageIndex: index } })}
                      title="Open in Decision Canvas"
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-[#0071e3] hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>Chart</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleCopyResponse(item.response, index)}
                    title="Copy response"
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {copiedIndex === index
                      ? <><Check className="w-3.5 h-3.5" /><span>Copied</span></>
                      : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>
                    }
                  </button>
                  <button
                    onClick={() => onRegenerate?.(item)}
                    title="Regenerate response"
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </button>
                  {(() => {
                    const fbKey = item.traceId || item.timestamp;
                    const voted = feedbackState[fbKey];
                    return (
                      <>
                        <button
                          onClick={() => handleFeedback(item, 'up')}
                          title="Good response"
                          disabled={!!voted}
                          className={`p-1.5 rounded transition-colors ${
                            voted === 'up'
                              ? 'text-[#0071e3]'
                              : 'text-text-secondary hover:text-text-primary hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" fill={voted === 'up' ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => handleFeedback(item, 'down')}
                          title="Poor response"
                          disabled={!!voted}
                          className={`p-1.5 rounded transition-colors ${
                            voted === 'down'
                              ? 'text-[#0071e3]'
                              : 'text-text-secondary hover:text-text-primary hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" fill={voted === 'down' ? 'currentColor' : 'none'} />
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <span className="message-timestamp">
              {(isStreamingMessage && isStreaming) ? (
                <span className="text-yellow-600">Streaming...</span>
              ) : (
                formatTime(new Date(new Date(item.timestamp).getTime() + 1000))
              )}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative"
      ref={(el) => {
        messagesContainerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
    >
      <div className="messages-wrapper">
        {chatHistory.map(renderMessage)}
      </div>

      {showScrollIndicator && (
        <button
          onClick={() => scrollToBottom()}
          className="scroll-button"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

export default ChatMessages;