import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import PlotlyChartSet from '../tables/PlotlyChartSet';
import { TableDataSet } from '../tables/TableDataSet';

const CanvasCard = ({ title, badge, children }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-900 overflow-hidden mb-4">
    <div className="flex items-center justify-between px-4 py-2.5
                    border-b border-gray-100 dark:border-gray-800">
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</span>
      {badge && (
        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800
                         px-2 py-0.5 rounded-full">{badge}</span>
      )}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

export default function DecisionCanvas() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const highlightRef = useRef(null);

  const { message, chatHistory = [], messageIndex = 0 } = state || {};

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  if (!message) return <Navigate to="/querylab" />;

  const title = (message.query || '').slice(0, 60) + ((message.query || '').length > 60 ? '…' : '');

  // Right panel: agent findings from saved thoughts
  const keyFindings = (message.thoughts || [])
    .filter(t => t.type === 'agent_response')
    .map(t => ({ agent: t.agent, text: (t.answer || '').slice(0, 200) }));

  const fallbackSentences = (message.response || '')
    .split('. ')
    .slice(0, 3)
    .filter(Boolean);

  const sources = message.dataSources || [];
  const followUps = message.followUpQuestions || [];

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800
                      bg-white dark:bg-gray-900 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm
                     text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100
                     hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Chat</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {title} — Decision Canvas
          </h1>
        </div>
        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                         bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
          <BarChart2 className="w-3.5 h-3.5" />
          Chart
        </span>
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: conversation thread */}
        <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800
                        bg-white dark:bg-gray-900 overflow-y-auto p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1 mb-2">
            Conversation
          </p>
          {chatHistory.slice(0, messageIndex + 1).map((item, i) => {
            const isHighlighted = i === messageIndex;
            return (
              <div
                key={i}
                ref={isHighlighted ? highlightRef : null}
                className={`rounded-lg p-2.5 text-xs space-y-1 transition-colors
                  ${isHighlighted
                    ? 'border-l-2 border-blue-500 bg-blue-50/40 dark:bg-blue-900/10'
                    : 'border border-gray-100 dark:border-gray-800'
                  }`}
              >
                <p className="font-medium text-gray-700 dark:text-gray-300 line-clamp-1">
                  {item.query}
                </p>
                <p className="text-gray-400 dark:text-gray-500 line-clamp-2">
                  {(item.response || '').slice(0, 120)}{(item.response || '').length > 120 ? '…' : ''}
                </p>
              </div>
            );
          })}
        </div>

        {/* Center: canvas cards */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">
            Data
          </p>

          {/* Primary Plotly chart */}
          {message.plotlyJson && Object.keys(message.plotlyJson).length > 0 && (
            <CanvasCard title="Chart" badge={`turn ${messageIndex + 1}`}>
              <PlotlyChartSet plotlyJson={message.plotlyJson} />
            </CanvasCard>
          )}

          {/* Artifact charts */}
          {(message.artifacts || [])
            .filter(a => a.type === 'chart' || a.type === 'plotly')
            .map((artifact, i) => (
              <CanvasCard key={`chart-art-${i}`} title={artifact.title || 'Chart'} badge={`turn ${messageIndex + 1}`}>
                <PlotlyChartSet plotlyJson={artifact.data} />
              </CanvasCard>
            ))}

          {/* Artifact tables */}
          {(message.artifacts || [])
            .filter(a => a.type === 'table')
            .map((artifact, i) => (
              <CanvasCard key={`table-art-${i}`} title={artifact.title || 'Table'} badge={`turn ${messageIndex + 1}`}>
                <TableDataSet tableData={artifact.data} />
              </CanvasCard>
            ))}

          {/* Primary table */}
          {message.tableData && Object.keys(message.tableData).length > 0 && (
            <CanvasCard title="Data" badge={`turn ${messageIndex + 1}`}>
              <TableDataSet tableData={message.tableData} />
            </CanvasCard>
          )}

          {/* SQL queries */}
          {message.sql_query && Object.keys(message.sql_query).length > 0 &&
            Object.entries(message.sql_query).map(([key, sqlText], i) => (
              <CanvasCard key={`sql-${i}`} title={`Query · ${key}`} badge="SQL">
                <pre className="text-xs font-mono overflow-x-auto whitespace-pre
                                bg-gray-50 dark:bg-gray-800 rounded p-3 text-gray-700 dark:text-gray-300">
                  {sqlText}
                </pre>
              </CanvasCard>
            ))}
        </div>

        {/* Right: What Query Labs noticed */}
        <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800
                        bg-white dark:bg-gray-900 overflow-y-auto p-4 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
              What Query Labs noticed
            </p>
            {keyFindings.length > 0 ? (
              <ul className="space-y-2.5">
                {keyFindings.map((f, i) => (
                  <li key={i} className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{f.agent}: </span>
                    {f.text}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2 list-disc list-inside">
                {fallbackSentences.map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400">{s}.</li>
                ))}
              </ul>
            )}
          </div>

          {sources.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Sources
              </p>
              <ul className="space-y-1">
                {sources.map((src, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-gray-300">•</span>
                    <code className="font-mono">{src}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {followUps.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Follow-up questions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {followUps.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(-1)}
                    className="px-2.5 py-1 rounded-full text-xs border border-gray-200 dark:border-gray-700
                               text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600
                               dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
