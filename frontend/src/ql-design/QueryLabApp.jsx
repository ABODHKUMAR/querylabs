import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Cookies from 'js-cookie';
import './tokens.css';
import { NavContext } from './NavContext';
import { NavRail } from './shell/NavRail';
import { EmptyState } from './screens/EmptyState';
import { PlanView } from './screens/PlanView';
import { ClarifyView } from './screens/ClarifyView';
import { ThinkingView } from './screens/ThinkingView';
import { Workbench, InlineHistory } from './screens/Workbench';
import { ExecView } from './screens/ExecView';
import { generateAnalysisPlan, fetchAgentNames, streamDataForQuery, fetchConversations } from '../api/api';

function mkSessionId() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

function colId(col) {
  return col?.collection_id || col?.id || col?.name || col || '';
}

function colsId(cols) {
  if (!Array.isArray(cols) || cols.length === 0) return '';
  return cols.map(c => colId(c)).filter(Boolean).join(',');
}

export default function QueryLabApp() {
  const [phase, setPhase]     = useState('empty');
  const [mode, setMode]       = useState('analyst');
  const [userMsg, setUserMsg] = useState('');
  const [leftView, setLeftView] = useState('thread');

  const [collections,         setCollections]         = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);

  const [planData,    setPlanData]    = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError,   setPlanError]   = useState(null);
  const [clarifyAnswering, setClarifyAnswering] = useState(false);

  const [streamingText,    setStreamingText]    = useState('');
  const [streamStatus,     setStreamStatus]     = useState(null);
  const [planStepStatuses, setPlanStepStatuses] = useState({});
  const [streamResult,     setStreamResult]     = useState(null);
  const [thoughts,         setThoughts]         = useState([]);

  const navigate = useNavigate();
  const location = useLocation();

  // Auth guard — bounce to login if no token
  useEffect(() => {
    if (!Cookies.get('authToken')) navigate('/');
  }, [navigate]);

  // Use the same session/user IDs as ChatBox so the backend recognises the session
  const sessionId = useRef(
    localStorage.getItem('sessionId') ||
    `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`.slice(0, 32)
  );
  const userId = useRef(localStorage.getItem('ql_userID') || 'anonymous');
  const abortRef    = useRef(null);
  const convHistory = useRef([]);

  // Stable refs so stream callbacks never go stale
  const userMsgRef    = useRef('');
  const collectionRef = useRef([]);
  const planDataRef   = useRef(null);
  userMsgRef.current    = userMsg;
  collectionRef.current = selectedCollections;
  planDataRef.current   = planData;

  useEffect(() => {
    fetchAgentNames()
      .then(cards => setCollections(cards || []))
      .catch(() => {});
  }, []);

  // Load a saved conversation when navigated from history panel
  useEffect(() => {
    const histId = location.state?.histId;
    if (!histId) return;

    // Clear state so a browser refresh doesn't re-trigger
    window.history.replaceState({}, '', location.pathname);

    setPhase('thinking');
    setStreamStatus({ stage: 'starting', message: 'Loading conversation…' });

    fetchConversations(
      histId,
      (uid) => { userId.current = uid; },
      (sid) => { sessionId.current = sid; localStorage.setItem('sessionId', sid); },
    )
      .then(convs => {
        if (!convs || convs.length === 0) { setPhase('empty'); return; }

        const last = convs[convs.length - 1];
        setUserMsg(last.query || location.state?.title || '');
        setStreamResult({
          response:    last.response   || '',
          chart_vis:   last.plotlyJson || {},
          data:        last.tableData  || [],
          sql_query:   last.sql_query  || '',
          dataSources: last.dataSources || [],
        });

        // Populate full conv history so follow-ups have context
        convHistory.current = convs.flatMap(c => [
          { role: 'user',      content: c.query    },
          { role: 'assistant', content: c.response },
        ]);

        setLeftView('thread');
        setPhase('result');
      })
      .catch(() => setPhase('empty'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.histId]);

  const handleSubmit = useCallback(async (text) => {
    const col = collectionRef.current;
    setUserMsg(text);
    setPlanLoading(true);
    setPlanError(null);
    setPlanData(null);
    setStreamResult(null);
    setStreamingText('');
    setPlanStepStatuses({});
    setPhase('plan');

    try {
      const plan = await generateAnalysisPlan(
        { query: text, collection: colsId(col), sessionID: sessionId.current, userID: userId.current },
        convHistory.current,
      );
      setPlanData(plan);
      planDataRef.current = plan;
    } catch (err) {
      setPlanError(err.message || 'Plan generation failed.');
    } finally {
      setPlanLoading(false);
    }
  }, []);

  // Submits the user's answer (or skip) to a clarifying question and re-requests the
  // plan — the backend enforces the one-round cap, so this call always resolves to a
  // real plan (never another clarification), even if the user skips.
  const handleClarifyAnswer = useCallback(async (answerText, { skip = false } = {}) => {
    const col = collectionRef.current;
    setClarifyAnswering(true);
    setPlanError(null);

    try {
      const plan = await generateAnalysisPlan(
        {
          query: userMsgRef.current,
          collection: colsId(col),
          sessionID: sessionId.current,
          userID: userId.current,
        },
        convHistory.current,
        null,
        null,
        skip ? null : answerText,
        skip,
      );
      setPlanData(plan);
      planDataRef.current = plan;
    } catch (err) {
      setPlanError(err.message || 'Plan generation failed.');
    } finally {
      setClarifyAnswering(false);
    }
  }, []);

  const handleRun = useCallback((approvedPlan) => {
    const msg  = userMsgRef.current;
    const col  = collectionRef.current;
    const plan = approvedPlan ?? planDataRef.current;

    abortRef.current?.();

    setPhase('thinking');
    setStreamingText('');
    setStreamStatus({ stage: 'starting', message: 'Starting…' });
    setPlanStepStatuses({});
    setStreamResult(null);
    setThoughts([]);

    // Token buffering — flush on next animation frame to avoid one setState per token
    const pendingRef = { current: '' };
    const rafRef     = { current: null };

    // Use agent names from plan steps as collection (same as ChatBox does)
    const planAgentNames = [...new Set((plan?.steps || []).map(s => s.agent_name).filter(Boolean))];
    const effectiveCollection = planAgentNames.length > 0 ? planAgentNames.join(',') : colsId(col);

    const abort = streamDataForQuery(
      { query: msg, collection: effectiveCollection, sessionID: sessionId.current, userID: userId.current, approved_plan: plan },
      {
        onStatus:  (s) => setStreamStatus(s),
        onThought: (t) => setThoughts(prev => [...prev, t]),

        onToken: (t) => {
          pendingRef.current += t;
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              const chunk = pendingRef.current;
              if (chunk) { pendingRef.current = ''; setStreamingText(prev => prev + chunk); }
            });
          }
        },

        onData: (dataEvent) => {
          // Accumulate incremental chart/table/sql data so it's available at complete time
          setStreamResult(prev => {
            const base = prev || {};
            if (dataEvent.type === 'chart') {
              return { ...base, chart_vis: { ...(base.chart_vis || {}), ...dataEvent.content } };
            }
            if (dataEvent.type === 'table_data') {
              return { ...base, data: { ...(base.data || {}), ...dataEvent.content } };
            }
            if (dataEvent.type === 'sql_query') {
              return { ...base, sql_query: { ...(base.sql_query || {}), ...dataEvent.content } };
            }
            return base;
          });
        },

        onPlanStepStatus: (data) =>
          setPlanStepStatuses(prev => ({
            ...prev,
            [data.step_id ?? data.step_number ?? data.id]: data.status,
          })),

        onComplete: (result) => {
          if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
          setStreamResult(prev => {
            // chart_vis: direct Plotly spec wins; otherwise merge dicts
            const inChart = result.chart_vis || {};
            const mergedChart = Array.isArray(inChart.data)
              ? inChart
              : { ...(prev?.chart_vis || {}), ...inChart };

            // data: flat array → keep array; object → merge with prev
            const inData = result.data;
            const mergedData = Array.isArray(inData)
              ? (inData.length > 0 ? inData : (prev?.data || []))
              : { ...(prev?.data || {}), ...(inData || {}) };

            // sql_query: string → keep string; object → merge with prev
            const inSql = result.sql_query;
            const mergedSql = typeof inSql === 'string'
              ? (inSql.trim() ? inSql : (prev?.sql_query || ''))
              : { ...(prev?.sql_query || {}), ...(inSql || {}) };

            return {
              ...result,
              chart_vis:    mergedChart,
              data:         mergedData,
              sql_query:    mergedSql,
              data_sources: result.data_sources || result.dataSources || prev?.data_sources || [],
            };
          });
          convHistory.current = [
            ...convHistory.current,
            { role: 'user',      content: msg             },
            { role: 'assistant', content: result.response },
          ];
          setPhase('result');
        },

        onError: (err) => {
          console.error('[Query Labs] stream error:', err);
          setStreamStatus({ stage: 'error', message: err.message });
          setStreamResult({ response: `Stream error: ${err.message}`, _error: true });
          setPhase('result');
        },
      },
      'querylab_sql',
      convHistory.current,
    );

    abortRef.current = abort;
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setPhase('empty');
    setMode('analyst');
    setUserMsg('');
    setLeftView('thread');
    setPlanData(null);
    setPlanLoading(false);
    setPlanError(null);
    setClarifyAnswering(false);
    setStreamResult(null);
    setStreamingText('');
    setStreamStatus(null);
    setPlanStepStatuses({});
    setThoughts([]);
    convHistory.current = [];
  }, []);

  const toggleCollection = useCallback((col) => {
    if (!col) { setSelectedCollections([]); return; }
    setSelectedCollections(prev => {
      const id = colId(col);
      const already = prev.some(c => colId(c) === id);
      return already ? prev.filter(c => colId(c) !== id) : [...prev, col];
    });
  }, []);

  const nav = useMemo(() => ({
    onAsk:    handleReset,
    onRun:    handleRun,
    onDone:   () => setPhase('result'),
    onMode:   (m) => { setMode(m); setPhase('result'); },
    onFollowUp: handleSubmit,
    onAnswerClarification: handleClarifyAnswer,
    onToggleHistory: () => setLeftView(v => v === 'history' ? 'thread' : 'history'),
    leftView,
    userMsg,
    collections,
    collection: selectedCollections,
    onCollectionChange: toggleCollection,
    planData,
    planLoading,
    planError,
    clarifyAnswering,
    streamingText,
    streamStatus,
    planStepStatuses,
    streamResult,
    thoughts,
  }), [
    handleReset, handleRun, handleSubmit, handleClarifyAnswer, toggleCollection,
    leftView,
    userMsg,
    collections, selectedCollections,
    planData, planLoading, planError, clarifyAnswering,
    streamingText, streamStatus, planStepStatuses, streamResult, thoughts,
  ]);

  let body;
  if (phase === 'empty') {
    body = (
      <div style={{ display: 'flex', height: '100%', background: 'var(--paper)' }}>
        <NavRail />
        {leftView === 'history' && (
          <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
            <InlineHistory />
          </div>
        )}
        <EmptyState onSubmit={handleSubmit} />
      </div>
    );
  } else if (phase === 'plan') {
    body = planData?.needs_clarification ? <ClarifyView /> : <PlanView />;
  } else if (phase === 'thinking') {
    body = <ThinkingView />;
  } else if (phase === 'result') {
    body = mode === 'analyst'
      ? <Workbench onMode={(m) => setMode(m)} />
      : <ExecView  onMode={(m) => setMode(m)} />;
  }

  return (
    <NavContext.Provider value={nav}>
      <div
        className="ql-root"
        style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}
      >
        {body}
      </div>
    </NavContext.Provider>
  );
}
