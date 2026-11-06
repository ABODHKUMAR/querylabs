import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Plot from 'react-plotly.js';
import { NavContext } from '../NavContext';
import { NavRail } from '../shell/NavRail';
import { ThreadHeader, ThreadMessage, ThreadComposer } from '../shell/ThreadPanel';
import { CanvasToolbar } from '../shell/CanvasToolbar';
import { LineChart, BarChart } from '../charts';
import { I } from '../icons';

// ─── helpers ────────────────────────────────────────────────────────────────

// chart_vis can be a direct Plotly spec {data:[...], layout:{...}}  OR  a dict {name: spec}
function _hasRealData(spec) {
  return (spec?.data || []).some(
    t => Array.isArray(t.y) && t.y.filter(v => v != null && v !== 0).length >= 2
  );
}

function normalizeCharts(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  if (Array.isArray(raw.data) && raw.data.length > 0)
    return _hasRealData(raw) ? [['Chart', raw]] : [];
  return Object.entries(raw)
    .filter(([, v]) => v && Array.isArray(v?.data) && v.data.length > 0 && _hasRealData(v));
}

// data can be: flat array [row,...] | dict {tableName: rows[]} | dict {tableName: {rows,columns}}
function normalizeTables(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.length > 0 ? [['Results', raw]] : [];
  if (typeof raw !== 'object') return [];
  return Object.entries(raw).filter(([, v]) => {
    if (!v) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object' && v.rows && v.columns) return true;
    return false;
  });
}

// sql_query can be a plain string OR a dict {name: sql}
function normalizeSqls(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.trim() ? [['query', raw]] : [];
  return Object.entries(raw).filter(([, v]) => v);
}

const MD_COMPONENTS = {
  p:      ({ children }) => <p style={{ margin: '6px 0 0', lineHeight: 1.65 }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{children}</strong>,
  em:     ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  h1:     ({ children }) => <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', marginTop: 14, marginBottom: 2 }}>{children}</div>,
  h2:     ({ children }) => <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', marginTop: 12, marginBottom: 2 }}>{children}</div>,
  h3:     ({ children }) => <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginTop: 10, marginBottom: 2 }}>{children}</div>,
  ul:     ({ children }) => <ul style={{ paddingLeft: 18, margin: '4px 0' }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ paddingLeft: 18, margin: '4px 0' }}>{children}</ol>,
  li:     ({ children }) => <li style={{ margin: '2px 0', lineHeight: 1.55 }}>{children}</li>,
  code:   ({ inline, children }) => inline
    ? <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5, background: 'var(--surface-tint)', padding: '1px 4px', borderRadius: 4 }}>{children}</code>
    : <pre style={{ fontFamily: 'var(--mono)', fontSize: 11.5, background: 'var(--surface-tint)', padding: '10px 12px', borderRadius: 8, overflowX: 'auto', margin: '6px 0' }}><code>{children}</code></pre>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 12, margin: '8px 0', color: 'var(--ink-3)' }}>{children}</blockquote>,
};

function MdText({ children, style }) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', ...style }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {typeof children === 'string' ? children : ''}
      </ReactMarkdown>
    </div>
  );
}

function CardChrome({ title, tag, badge, children, foot }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {tag && <span style={{ color: 'var(--brand)', display: 'inline-flex' }}>{tag}</span>}
          <span className="h-card" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {badge && <span className="chip" style={{ fontSize: 10.5, padding: '2px 6px' }}>{badge}</span>}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icn" style={{ width: 26, height: 26 }}><I.pin /></button>
          <button className="icn" style={{ width: 26, height: 26 }}><I.expand /></button>
          <button className="icn" style={{ width: 26, height: 26 }}><I.more /></button>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, padding: '4px 16px 14px' }}>
        {children}
      </div>
      {foot && (
        <footer style={{
          padding: '10px 16px', borderTop: '1px solid var(--line-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-tint)',
        }}>
          {foot}
        </footer>
      )}
    </div>
  );
}

function plotlyToSeries(spec) {
  if (!spec?.data) return [];
  return spec.data
    .filter(t => Array.isArray(t.y) && t.y.length > 0)
    .map((t, i) => ({
      data:   t.y.map(Number).filter(v => !isNaN(v)),
      color:  i === 0 ? 'var(--brand)' : 'var(--ink-4)',
      dashed: i > 0,
    }));
}

function plotlyLabels(spec) {
  return (spec?.data?.[0]?.x || []).map(String);
}

function plotlyTitle(spec, fallback) {
  const t = spec?.layout?.title;
  return (typeof t === 'string' ? t : t?.text) || fallback || 'Chart';
}

function computeChartMargin(spec) {
  const labels = (spec?.data?.[0]?.x || []).map(String);
  const maxLen = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const tickAngle = spec?.layout?.xaxis?.tickangle ?? 0;
  const needsRotation = tickAngle !== 0 || maxLen > 12 || labels.length > 8;
  if (!needsRotation) return { t: 8, r: 12, b: 36, l: 44 };
  const b = Math.min(140, Math.max(80, Math.ceil(maxLen * 5.5 * 0.707) + 24));
  return { t: 8, r: 12, b, l: 44 };
}

function ChartCard({ name, spec }) {
  const title = plotlyTitle(spec, name);
  const labels = (spec?.data?.[0]?.x || []).map(String);
  const maxLen = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const needsRotation = maxLen > 12 || labels.length > 8;
  const margin = computeChartMargin(spec);
  const layout = {
    ...(spec?.layout || {}),
    title:         null,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    margin,
    autosize:      true,
    height:        240,
    font:          { size: 11, color: '#6b7280' },
    xaxis: { ...(spec?.layout?.xaxis || {}), tickangle: needsRotation ? -45 : 0 },
  };
  const containerHeight = 240 + Math.max(0, margin.b - 36);

  return (
    <CardChrome title={title} tag={<I.chart />}>
      <div style={{ height: containerHeight }}>
        <Plot
          data={spec?.data || []}
          layout={layout}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </CardChrome>
  );
}

function TableCard({ name, tableData }) {
  let columns = [], rows = [];

  if (Array.isArray(tableData) && tableData.length > 0) {
    if (typeof tableData[0] === 'object' && tableData[0] !== null) {
      columns = Object.keys(tableData[0]);
      rows    = tableData.map(row => columns.map(c => row[c]));
    }
  } else if (tableData?.columns && tableData?.rows) {
    columns = tableData.columns;
    const raw = tableData.rows;
    rows = raw.length > 0 && Array.isArray(raw[0])
      ? raw
      : raw.map(r => columns.map(c => r[c]));
  }

  const displayRows = rows.slice(0, 50);

  return (
    <CardChrome
      title={name || 'Results'}
      tag={<I.table />}
      foot={
        <>
          <span className="label">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          <button className="btn ghost sm">Open as table →</button>
        </>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {columns.map((h, i) => (
                <th key={i} style={{
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: '8px 10px 10px', fontSize: 10.5, fontWeight: 500, color: 'var(--ink-3)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  borderBottom: '1px solid var(--line-soft)', whiteSpace: 'nowrap',
                }}>
                  {String(h).replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                {r.map((c, j) => (
                  <td key={j} style={{
                    padding: '9px 10px', textAlign: j === 0 ? 'left' : 'right',
                    color: 'var(--ink)', fontVariantNumeric: 'tabular-nums',
                    fontWeight: j === 0 ? 500 : 400,
                  }}>
                    {c == null ? '—' : String(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 50 && (
          <div className="label" style={{ padding: '8px 10px', color: 'var(--ink-3)' }}>
            Showing 50 of {rows.length} rows
          </div>
        )}
      </div>
    </CardChrome>
  );
}

function SqlCard({ name, sql }) {
  const sqlStr = typeof sql === 'string' ? sql : JSON.stringify(sql, null, 2);
  return (
    <CardChrome
      title={`Query · ${name || 'generated'}`}
      tag={<I.code />}
      foot={
        <>
          <span className="label">Generated by Query Labs</span>
          <button className="btn ghost sm" style={{ color: 'var(--brand-2)' }}>Open in SQL editor →</button>
        </>
      }
    >
      <div className="mono" style={{
        fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
        background: 'var(--surface-tint)', borderRadius: 8, padding: '12px 14px',
        border: '1px solid var(--line-soft)', overflow: 'auto', maxHeight: 300,
      }}>
        {sqlStr}
      </div>
    </CardChrome>
  );
}

function SourcesCard({ sources }) {
  return (
    <CardChrome title="Sources in this brief" tag={<I.database />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.length > 0 ? sources.map((s, i) => {
          const name = typeof s === 'string' ? s : s?.name || s?.source || s?.table || s?.collection || JSON.stringify(s);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              background: 'var(--surface-tint)', borderRadius: 8, border: '1px solid var(--line-soft)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pos)', flexShrink: 0 }} />
              <div className="mono" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {name}
              </div>
            </div>
          );
        }) : (
          <div className="label" style={{ color: 'var(--ink-3)', padding: 8 }}>No source information available</div>
        )}
      </div>
    </CardChrome>
  );
}

function InsightsCard({ thoughts }) {
  const items = thoughts.slice(0, 4);
  return (
    <CardChrome title="What Query Labs noticed" tag={<I.sparkle />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((t, i) => {
          const text    = typeof t === 'string' ? t : t?.content || t?.text || JSON.stringify(t);
          const dotColor = i % 3 === 0 ? 'var(--pos)' : i % 3 === 1 ? 'var(--neg)' : 'var(--warn)';
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 6, height: 6, marginTop: 7, borderRadius: '50%', flexShrink: 0, background: dotColor }} />
              <div className="body-sm" style={{ color: 'var(--ink)', fontWeight: 500 }}>{text}</div>
            </div>
          );
        })}
      </div>
    </CardChrome>
  );
}

// ─── main canvas ────────────────────────────────────────────────────────────

function ArtifactCanvas({ onMode, streamResult, thoughts: externalThoughts }) {
  if (!streamResult) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)' }}>
        <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 360 }}>
          <div className="h-card" style={{ marginBottom: 8 }}>No results yet</div>
          <div className="body-sm" style={{ color: 'var(--ink-3)' }}>Run an analysis from the empty state to see results here.</div>
        </div>
      </div>
    );
  }

  const charts   = normalizeCharts(streamResult.plotlyJson || streamResult.chart_vis);
  const tables   = normalizeTables(streamResult.data);
  const sqls     = normalizeSqls(streamResult.sql_query);
  const sources = (() => {
    const names = new Set();
    const traceThoughts = externalThoughts || streamResult.thoughts || [];
    traceThoughts
      .filter(t => t.type === 'agent_tool_trace')
      .forEach(t => {
        const args = t.args || {};
        if (Array.isArray(args.table_names)) args.table_names.forEach(n => names.add(n));
        if (typeof args.collection_name === 'string' && args.collection_name) names.add(args.collection_name);
      });
    return names.size > 0 ? [...names] : (streamResult.dataSources || streamResult.data_sources || []);
  })();
  const thoughts = streamResult.thoughts || [];

  const hasContent = charts.length > 0 || tables.length > 0 || sqls.length > 0;
  const response   = streamResult.response || '';

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--paper)' }}>

      {/* Row 1: first chart + insights (or second chart, or sources) — stacked, chart on top */}
      {charts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
          <ChartCard name={charts[0][0]} spec={charts[0][1]} />
          {thoughts.length > 0
            ? <InsightsCard thoughts={thoughts} />
            : charts.length > 1
              ? <ChartCard name={charts[1][0]} spec={charts[1][1]} />
              : <SourcesCard sources={sources} />
          }
        </div>
      )}

      {/* Row 2: tables */}
      {tables.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 18 }}>
          <TableCard name={tables[0][0]} tableData={tables[0][1]} />
          {tables.length > 1
            ? <TableCard name={tables[1][0]} tableData={tables[1][1]} />
            : charts.length === 0
              ? <SourcesCard sources={sources} />
              : null
          }
        </div>
      )}

      {/* Row 3: SQL + sources */}
      {sqls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
          <SqlCard name={sqls[0][0]} sql={sqls[0][1]} />
          <SourcesCard sources={sources} />
        </div>
      )}

      {/* Sources-only fallback: no chart/table/sql — shown regardless of response text */}
      {!hasContent && sources.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <SourcesCard sources={sources} />
        </div>
      )}

      {/* Nothing at all */}
      {!hasContent && !response && sources.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)' }}>
          <div className="body">Analysis complete. See the thread for the full response.</div>
        </div>
      )}
    </div>
  );
}

// ─── thread ─────────────────────────────────────────────────────────────────

export function InlineHistory() {
  const navigate = useNavigate();
  const { onToggleHistory } = useContext(NavContext);
  const [items] = useState(() => {
    try { return JSON.parse(localStorage.getItem('allHistoryTitle') || '[]'); } catch { return []; }
  });

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span className="h-section">History</span>
        <button className="icn" onClick={onToggleHistory} title="Back to conversation" style={{ width: 26, height: 26 }}>
          <I.chevron dir="left" size={12} />
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>No history yet</div>
      ) : items.map((item, i) => (
        <div
          key={i}
          onClick={() => navigate('/querylab', { state: { histId: item.hist_id || item.id, title: item.title } })}
          style={{
            padding: '10px 16px', borderBottom: '1px solid var(--line-soft)',
            cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4,
            transition: 'background .1s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-tint)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {item.title || 'Untitled conversation'}
        </div>
      ))}
    </div>
  );
}

function WorkbenchThread({ userMsg, streamResult, thoughts }) {
  const response  = streamResult?.response || '';
  const followUps = streamResult?.followUpQuestions || streamResult?.follow_up_questions || [];
  const refs = (() => {
    const names = new Set();
    (thoughts || streamResult?.thoughts || [])
      .filter(t => t.type === 'agent_tool_trace')
      .forEach(t => {
        const args = t.args || {};
        if (Array.isArray(args.table_names)) args.table_names.forEach(n => names.add(n));
        if (typeof args.collection_name === 'string' && args.collection_name) names.add(args.collection_name);
      });
    if (names.size > 0) return [...names].slice(0, 3);
    return (streamResult?.dataSources || streamResult?.data_sources || []).slice(0, 3).map(s =>
      typeof s === 'string' ? s : s?.name || s?.source || s?.table || 'source'
    );
  })();
  const { leftView } = useContext(NavContext);

  return (
    <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', background: 'var(--paper)' }}>
      {leftView === 'history' ? (
        <InlineHistory />
      ) : (
        <>
          <ThreadHeader />
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {userMsg && (
              <>
                <ThreadMessage role="user" time="now">
                  {userMsg}
                </ThreadMessage>
                <div style={{ height: 1, background: 'var(--line-soft)', margin: '0 22px' }} />
              </>
            )}
            {response ? (
              <ThreadMessage role="assistant" time="now" foot refs={refs}>
                <MdText style={{ fontSize: 13.5 }}>{response}</MdText>
              </ThreadMessage>
            ) : (
              <ThreadMessage role="assistant" time="now" foot>
                <span style={{ color: 'var(--ink-3)' }}>The analysis completed — see the canvas for results.</span>
              </ThreadMessage>
            )}
          </div>
          <ThreadComposer suggestions={followUps.slice(0, 3)} />
        </>
      )}
    </div>
  );
}

// ─── root ────────────────────────────────────────────────────────────────────

export function Workbench({ onMode }) {
  const { userMsg, streamResult, thoughts } = useContext(NavContext);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail />
      <WorkbenchThread userMsg={userMsg} streamResult={streamResult} thoughts={thoughts} />
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <CanvasToolbar mode="analyst" onMode={onMode} />
        <ArtifactCanvas onMode={onMode} streamResult={streamResult} thoughts={thoughts} />
      </section>
    </div>
  );
}
