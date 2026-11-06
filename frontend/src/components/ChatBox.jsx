import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { fetchDataCollections, fetchAgentNames, fetchAllHistory, fetchConversations, patchHistoryPin } from "../api/api";
import { ChevronUp, Database } from "lucide-react";
import ChatHistory from "./ChatHistory";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";
import EmptyState from "./EmptyState";
import TypingIndicator from "./TypingIndicator";
import SideIconNav from "./SideIconNav";
import ConversationPanel from "./ConversationPanel";
import PlanWorkspace from "./PlanWorkspace";
import useLocalStorage from "./hooks/useLocalStorage";
import { useStreamingQuery } from "./hooks/useStreamingQuery";
import { useAnalysisPlan } from "./hooks/useAnalysisPlan";
import { useMediaQuery } from "react-responsive";
import './ChatBox.css';

const ChatBox = () => {
  const isDesktop = useMediaQuery({ minWidth: 1024 });
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setHistoryLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [agentNames, setAgentNames] = useState([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [newChat, setNewChat] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [typing, setTyping] = useState(false);
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(false);
  const [speakerEnable, setSpeakerEnable] = useState(false);

  // New layout state
  const [activeLeftView, setActiveLeftView] = useState('conversation'); // 'conversation' | 'history'
  const [activePlanTab, setActivePlanTab] = useState('plan');
  const [autoApprove, setAutoApprove] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');

  const [sessionId, setSessionId] = useLocalStorage(
    "sessionId",
    `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`.slice(0, 32)
  );
  const [userID, setUserId] = useLocalStorage("ql_userID", "anonymous");
  const [useStreaming, setUseStreaming] = useLocalStorage("useStreaming", true);
  const [mcpConfigs, setMCPConfigs] = useLocalStorage("mcpConfigs", []);

  useEffect(() => {
    console.log("[ChatBox] useStreaming state:", useStreaming);
  }, [useStreaming]);

  const {
    isStreaming,
    streamingText,
    status,
    thoughts,
    insights,
    streamingData,
    startStreaming,
    stopStreaming,
    resetStreaming,
  } = useStreamingQuery();

  const {
    planState,
    fetchPlan,
    updateStep: updatePlanStep,
    removeStep: removePlanStep,
    reorderSteps: reorderPlanSteps,
    setConstraints: setPlanConstraints,
    setAssumption: setPlanAssumption,
    buildApprovedPlan,
    updateStepStatus,
    startExecuting,
    completePlan,
    retryPlan,
    resetPlan,
    addStep: addPlanStep,
  } = useAnalysisPlan();

  const pendingQueryRef = useRef(null);

  // Clean up stale streaming placeholders on mount
  useEffect(() => {
    setChatHistory(prev => {
      const hasStale = prev.some(item => item.isStreaming);
      if (!hasStale) return prev;
      return prev.map(item => {
        if (!item.isStreaming) return item;
        if (item.response) return { ...item, isStreaming: false };
        return { ...item, isStreaming: false, error: 'Response was interrupted. Please try again.' };
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.log("[ChatBox] startStreaming function available:", !!startStreaming);
  }, [startStreaming]);

  const [selectedDatasetIds, setSelectedDatasetIds] = useLocalStorage("selectedDatasetIds", []);
  const [chatHistory, setChatHistory] = useLocalStorage("chatHistory", []);
  const [allChatHistory, setAllChatHistory] = useLocalStorage("allChatHistory", []);
  const [allHistoryTitle, setAllHistoryTitle] = useLocalStorage("allHistoryTitle", []);

  const chatHistoryRef = useRef(null);
  const mainRef = useRef(null);
  const welcomeChatInputRef = useRef(null);
  const chatInputRef = useRef(null);

  // Auto-approve effect
  useEffect(() => {
    if (autoApprove && planState.phase === 'pending_approval') {
      handlePlanApprove();
    }
  }, [planState.phase, autoApprove]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active tab with plan phase
  useEffect(() => {
    if (planState.phase === 'pending_approval') {
      setActivePlanTab('plan');
    } else if (planState.phase === 'executing') {
      setActivePlanTab('run');
    }
  }, [planState.phase]);

  useEffect(() => {
    const handleScroll = () => {
      if (!mainRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = mainRef.current;
      setScrolled(!(scrollTop + clientHeight >= scrollHeight - 5));
    };
    const current = mainRef.current;
    if (current) current.addEventListener("scroll", handleScroll);
    return () => { if (current) current.removeEventListener("scroll", handleScroll); };
  }, []);

  useEffect(() => {
    if (newChat) {
      setNewChat(chatHistory.length === 0);
    } else {
      setNewChat(false);
    }
  }, [chatHistory.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mountedAgentRef = useRef(false);
  const lastPrimaryAgent = useRef(null);
  useEffect(() => {
    const current = selectedDatasetIds[0] ?? null;
    if (!mountedAgentRef.current) {
      mountedAgentRef.current = true;
      lastPrimaryAgent.current = current;
      return;
    }
    const prev = lastPrimaryAgent.current;
    lastPrimaryAgent.current = current;
    if (current !== null && current !== prev && chatHistory.length > 0) {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`.slice(0, 32);
      updateSessionId(newSessionId);
      setChatHistory([]);
    }
  }, [selectedDatasetIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const getDataCollections = async () => {
      try {
        const response = await fetchDataCollections();
        if (response) {
          setDatasets(response.map(name => ({ id: name, name })));
          const validIds = new Set(response);
          setSelectedDatasetIds(prev => prev.filter(id => validIds.has(id)));
        }
      } catch (error) {
        console.error("Failed to fetch datasets:", error);
        setDatasets([]);
      }
    };
    const getAgentNames = async () => {
      const names = await fetchAgentNames();
      setAgentNames(names);
    };
    getDataCollections();
    getAgentNames();
  }, []);

  const toggleDatasetSelection = useCallback(
    (datasetId) => {
      setSelectedDatasetIds(prev =>
        prev.includes(datasetId) ? prev.filter(id => id !== datasetId) : [...prev, datasetId]
      );
    },
    [setSelectedDatasetIds]
  );

  function updateSessionId(newSessionId) {
    setSessionId(newSessionId);
  }

  const handleNewChat = useCallback(() => {
    setChatHistory([]);
    setSelectedDatasetIds([]);
    setSessionTitle('');
    resetPlan();
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    updateSessionId(newSessionId);
    setActiveLeftView('conversation');
  }, [setChatHistory, setSelectedDatasetIds, resetPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadChat = useCallback(async (histID) => {
    try {
      setActiveLeftView('conversation');
      setTyping(false);
      setIsLoadingFromHistory(true);
      setIsLoading(true);
      const response = await fetchConversations(histID, setUserId, updateSessionId);
      if (response.length > 0) {
        setChatHistory(response);
        setNewChat(false);
        setSessionTitle(response[0]?.query?.slice(0, 60) || '');
        const firstMsg = response[0];
        if (firstMsg?.dataSources?.length > 0) {
          setSelectedDatasetIds(firstMsg.dataSources);
        } else {
          setSelectedDatasetIds([]);
        }
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsLoadingFromHistory(false), 100);
    }
  }, [allChatHistory, setChatHistory, setSelectedDatasetIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToChatHistory = useCallback((newItem) => {
    if (newItem.timestamp) {
      setChatHistory(prev => {
        const existingIndex = prev.findIndex(item => item.timestamp === newItem.timestamp && item.isStreaming);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newItem;
          return updated;
        }
        return [...prev, newItem];
      });
      setAllChatHistory(prev => {
        const existingIndex = prev.findIndex(item => item.timestamp === newItem.timestamp && item.isStreaming);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newItem;
          return updated;
        }
        return [...prev, newItem];
      });
    } else {
      setChatHistory(prev => [...prev, newItem]);
      setAllChatHistory(prev => [...prev, newItem]);
    }
    setNewChat(false);
    // Set session title from first user message
    if (newItem.query) {
      setSessionTitle(prev => prev || newItem.query.slice(0, 60));
    }
  }, [setChatHistory, setAllChatHistory]);

  const handlePinToggle = useCallback(async (histId) => {
    setAllHistoryTitle(prev => prev.map(item =>
      item.hist_id === histId ? { ...item, is_pinned: !item.is_pinned } : item
    ));
    try {
      await patchHistoryPin(histId);
    } catch (err) {
      console.error("Pin toggle failed:", err);
      setAllHistoryTitle(prev => prev.map(item =>
        item.hist_id === histId ? { ...item, is_pinned: !item.is_pinned } : item
      ));
    }
  }, [setAllHistoryTitle]);

  // ── Plan handlers ─────────────────────────────────────────────────────────

  const removePendingPlanEntry = useCallback(() => {
    setChatHistory(prev =>
      prev[prev.length - 1]?.isPlanPending ? prev.slice(0, -1) : prev
    );
  }, [setChatHistory]);

  const handlePlanApprove = useCallback(() => {
    if (!pendingQueryRef.current) return;
    const { payload, formattedHistory, timestamp } = pendingQueryRef.current;
    const approvedPlan = buildApprovedPlan();
    const snapshotSteps = planState.editedSteps ? [...planState.editedSteps] : [];

    const planAgentNames = [...new Set(approvedPlan.steps.map(s => s.agent_name).filter(Boolean))];
    const updatedPayload = planAgentNames.length > 0
      ? { ...payload, collection: planAgentNames.join(',') }
      : payload;

    setChatHistory(prev => prev.map(entry =>
      entry.timestamp === timestamp ? { ...entry, isStreaming: true } : entry
    ));

    startExecuting();

    startStreaming(
      updatedPayload, "querylab_sql", formattedHistory,
      (response) => {
        setChatHistory(prev => prev.map(entry =>
          entry.timestamp === timestamp
            ? {
                ...entry,
                tableData: response.data,
                sql_query: response.sql_query,
                citation: response.source,
                response: response.response,
                plotlyJson: response.plotlyJson,
                dataSources: response.dataSources || [],
                isStreaming: false,
                isPlanPending: false,
                wasStreamed: true,
                thoughts: response.thoughts || [],
                artifacts: response.artifacts || [],
                traceId: response.traceId || '',
                followUpQuestions: response.followUpQuestions || [],
                planSnapshot: { editedSteps: snapshotSteps },
              }
            : entry
        ));
        completePlan();
        pendingQueryRef.current = null;
      },
      (error) => {
        setChatHistory(prev => prev.map(entry =>
          entry.timestamp === timestamp
            ? {
                ...entry,
                error: error?.message === 'Failed to fetch'
                  ? 'Connection lost or request timed out. Please try again.'
                  : (error?.message || 'Streaming failed. Please try again.'),
                isStreaming: false,
                isPlanPending: false,
              }
            : entry
        ));
        resetPlan();
        pendingQueryRef.current = null;
      },
      approvedPlan,
      updateStepStatus,
    );
  }, [buildApprovedPlan, startExecuting, completePlan, resetPlan, updateStepStatus, startStreaming, setChatHistory, planState.editedSteps]);

  const handlePlanReject = useCallback(() => {
    removePendingPlanEntry();
    resetPlan();
    pendingQueryRef.current = null;
  }, [removePendingPlanEntry, resetPlan]);

  const handlePlanSkip = useCallback(() => {
    if (!pendingQueryRef.current) return;
    const { payload, formattedHistory, timestamp } = pendingQueryRef.current;

    removePendingPlanEntry();
    resetPlan();

    addToChatHistory({ query: payload.query || '', response: "", isStreaming: true, timestamp });
    pendingQueryRef.current = null;

    startStreaming(
      payload, "querylab_sql", formattedHistory,
      (response) => {
        addToChatHistory({
          query: payload.query || '',
          tableData: response.data,
          sql_query: response.sql_query,
          citation: response.source,
          response: response.response,
          plotlyJson: response.plotlyJson,
          dataSources: response.dataSources || [],
          timestamp,
          isStreaming: false,
          wasStreamed: true,
          thoughts: response.thoughts || [],
          artifacts: response.artifacts || [],
          traceId: response.traceId || '',
          followUpQuestions: response.followUpQuestions || [],
        });
      },
      (error) => {
        addToChatHistory({
          query: payload.query || '',
          error: error?.message === 'Failed to fetch'
            ? 'Connection lost or request timed out. Please try again.'
            : (error?.message || 'Streaming failed. Please try again.'),
          timestamp,
          isStreaming: false,
        });
      },
      null, null,
    );
  }, [removePendingPlanEntry, resetPlan, addToChatHistory, startStreaming]);

  const handlePlanRegenerate = useCallback((feedbackText) => {
    if (!pendingQueryRef.current) return;
    const { payload, formattedHistory } = pendingQueryRef.current;
    fetchPlan(payload, formattedHistory, feedbackText || null, null);
  }, [fetchPlan]);

  const handleStepRetry = useCallback(() => {
    if (!pendingQueryRef.current) return;
    const { payload, formattedHistory, timestamp } = pendingQueryRef.current;
    const approvedPlan = buildApprovedPlan();
    const snapshotSteps = planState.editedSteps ? [...planState.editedSteps] : [];

    const planAgentNames = [...new Set(approvedPlan.steps.map(s => s.agent_name).filter(Boolean))];
    const updatedPayload = planAgentNames.length > 0
      ? { ...payload, collection: planAgentNames.join(',') }
      : payload;

    stopStreaming();
    retryPlan();

    setChatHistory(prev => prev.map(entry =>
      entry.timestamp === timestamp ? { ...entry, response: "", isStreaming: true } : entry
    ));

    startStreaming(
      updatedPayload, "querylab_sql", formattedHistory,
      (response) => {
        setChatHistory(prev => prev.map(entry =>
          entry.timestamp === timestamp
            ? {
                ...entry,
                tableData: response.data,
                sql_query: response.sql_query,
                citation: response.source,
                response: response.response,
                plotlyJson: response.plotlyJson,
                dataSources: response.dataSources || [],
                isStreaming: false,
                isPlanPending: false,
                wasStreamed: true,
                thoughts: response.thoughts || [],
                artifacts: response.artifacts || [],
                traceId: response.traceId || '',
                followUpQuestions: response.followUpQuestions || [],
                planSnapshot: { editedSteps: snapshotSteps },
              }
            : entry
        ));
        completePlan();
        pendingQueryRef.current = null;
      },
      (error) => {
        setChatHistory(prev => prev.map(entry =>
          entry.timestamp === timestamp
            ? {
                ...entry,
                error: error?.message === 'Failed to fetch'
                  ? 'Connection lost or request timed out. Please try again.'
                  : (error?.message || 'Streaming failed. Please try again.'),
                isStreaming: false,
                isPlanPending: false,
              }
            : entry
        ));
        resetPlan();
        pendingQueryRef.current = null;
      },
      approvedPlan,
      updateStepStatus,
    );
  }, [buildApprovedPlan, retryPlan, stopStreaming, completePlan, resetPlan, updateStepStatus, startStreaming, setChatHistory, planState.editedSteps]);

  const handleContinuePartial = useCallback(() => {
    if (pendingQueryRef.current) {
      const { timestamp } = pendingQueryRef.current;
      const snapshotSteps = planState.editedSteps ? [...planState.editedSteps] : [];
      setChatHistory(prev => prev.map(entry =>
        entry.timestamp === timestamp
          ? { ...entry, isPlanPending: false, planSnapshot: { editedSteps: snapshotSteps } }
          : entry
      ));
      pendingQueryRef.current = null;
    }
    completePlan();
  }, [completePlan, setChatHistory, planState.editedSteps]);

  // ── End plan handlers ─────────────────────────────────────────────────────

  const handleFollowUpSubmit = useCallback((question) => {
    if (chatHistory.length > 0) {
      chatInputRef.current?.submit(question);
    } else {
      welcomeChatInputRef.current?.submit(question);
    }
  }, [chatHistory.length]);

  const handleRegenerate = useCallback((message) => {
    const queryToResubmit = message.query;
    setChatHistory(prev => {
      const idx = prev.findIndex(m => m.timestamp === message.timestamp);
      if (idx === -1) return prev;
      const newHistory = prev.slice(0, idx);
      const hasHistoryLeft = newHistory.length > 0;
      setTimeout(() => {
        const ref = hasHistoryLeft ? chatInputRef : welcomeChatInputRef;
        ref.current?.submit(queryToResubmit);
      }, 50);
      return newHistory;
    });
  }, [setChatHistory]);

  // Re-propose: regenerate plan for the most recent pending query
  const handleRepropose = useCallback(() => {
    if (pendingQueryRef.current) {
      handlePlanRegenerate(null);
    }
  }, [handlePlanRegenerate]);

  // History refresh on mount
  useEffect(() => {
    if (!userID || userID === 'anonymous') return;
    fetchAllHistory(userID, sessionId)
      .then(resp => {
        if (resp && Array.isArray(resp?.items || [])) setAllHistoryTitle(resp.items);
      })
      .catch(() => {});
  }, [userID]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevChatLengthRef = useRef(0);
  useEffect(() => {
    const prev = prevChatLengthRef.current;
    prevChatLengthRef.current = chatHistory.length;
    if (chatHistory.length > prev && !isLoadingFromHistory) {
      const refresh = async () => {
        try {
          const resp = await fetchAllHistory(userID, sessionId);
          if (resp && Array.isArray(resp?.items || [])) setAllHistoryTitle(resp.items);
        } catch {/* silent */}
      };
      const t1 = setTimeout(refresh, 0);
      const t2 = setTimeout(refresh, 4000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [chatHistory.length, isLoadingFromHistory, userID, sessionId, setAllHistoryTitle]);

  useEffect(() => {
    if (isStreaming) {
      console.log('[ChatBox] Streaming state:', { isStreaming, textLength: streamingText?.length || 0 });
    }
  }, [isStreaming, streamingText, status, thoughts]);

  const handleStarterQuestion = useCallback((question) => {
    setInputValue(question);
    welcomeChatInputRef.current?.submit(question);
  }, [setInputValue]);

  // sessionMeta for ConversationPanel
  const sessionMeta = useMemo(() => {
    const firstMsg = chatHistory[0];
    const formatTime = (ts) => {
      if (!ts) return '';
      try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
      catch { return ''; }
    };
    return {
      title: sessionTitle || firstMsg?.query?.slice(0, 60) || '',
      turnCount: chatHistory.length,
      startTime: formatTime(firstMsg?.timestamp),
      sourcesCount: selectedDatasetIds.length,
    };
  }, [chatHistory, sessionTitle, selectedDatasetIds]);

  const isPaused = planState.phase === 'loading' || planState.phase === 'pending_approval';
  // Show PlanWorkspace during plan creation, review, execution, and error.
  // When complete, revert to ChatMessages so the final result is shown automatically.
  const isPlanActive =
    planState.phase === 'loading' ||
    planState.phase === 'pending_approval' ||
    planState.phase === 'executing' ||
    planState.phase === 'error';

  const commonChatInputProps = {
    inputValue,
    setInputValue,
    isLoading,
    setIsLoading,
    selectedDatasetIds,
    datasets,
    toggleDatasetSelection,
    addToChatHistory,
    onFocusChange: setInputFocused,
    newChat,
    speakerEnable,
    setSpeakerEnable,
    chatHistory,
    sessionID: sessionId,
    userID,
    useStreaming,
    setUseStreaming,
    isStreaming,
    startStreaming,
    stopStreaming,
    status,
    thoughts,
    mcpConfigs,
    setMCPConfigs,
    fetchPlan,
    pendingQueryRef,
    isPlanPending: planState.phase === 'loading' || planState.phase === 'pending_approval',
  };

  return (
    <div className="querylab-layout">

      {/* ── Column 1: Icon strip ─────────────────────────────────────────── */}
      <SideIconNav
        activeLeftView={activeLeftView}
        onChangeView={setActiveLeftView}
        onNewChat={handleNewChat}
      />

      {/* ── Column 2: Left content panel ────────────────────────────────── */}
      <div className="querylab-left-panel">
        {activeLeftView === 'history' ? (
          <ChatHistory
            isVisible={true}
            setIsVisible={() => setActiveLeftView('conversation')}
            isLoading={isHistoryLoading}
            allChatHistory={allHistoryTitle}
            handleLoadChat={handleLoadChat}
            handleNewChat={handleNewChat}
            onPinToggle={handlePinToggle}
            availableAgents={datasets}
          />
        ) : (
          <ConversationPanel
            chatHistory={chatHistory}
            sessionMeta={sessionMeta}
            planPhase={planState.phase}
            isStreaming={isStreaming}
            onRegenerate={handleRepropose}
          />
        )}
      </div>

      {/* ── Column 3: Main workspace ─────────────────────────────────────── */}
      <div className="querylab-workspace">
        {isPlanActive ? (
          /* Plan workspace */
          <PlanWorkspace
            planState={planState}
            sessionTitle={sessionTitle}
            activeTab={activePlanTab}
            onTabChange={setActivePlanTab}
            autoApprove={autoApprove}
            onAutoApproveChange={setAutoApprove}
            onUpdateStep={updatePlanStep}
            onRemoveStep={removePlanStep}
            onAddStep={addPlanStep}
            onSetConstraints={setPlanConstraints}
            onApprove={handlePlanApprove}
            onReject={handlePlanReject}
            onSkip={handlePlanSkip}
            onRegenerate={handlePlanRegenerate}
            onRetryPlan={handleStepRetry}
            onContinuePartial={handleContinuePartial}
            onSetAssumption={setPlanAssumption}
            availableAgents={agentNames}
            thoughts={thoughts}
            insights={insights}
            isStreaming={isStreaming}
          />
        ) : (
          /* Normal chat workspace */
          <>
            <main ref={mainRef} className="main-content scrollbar-hide">
              {chatHistory.length > 0 ? (
                <>
                  <ChatMessages
                    ref={chatHistoryRef}
                    chatHistory={chatHistory}
                    inputFocused={inputFocused}
                    setTyping={setTyping}
                    speakerEnable={speakerEnable}
                    isLoadingFromHistory={isLoadingFromHistory}
                    streamingText={streamingText}
                    streamingData={streamingData}
                    isStreaming={isStreaming}
                    thoughts={thoughts}
                    insights={insights}
                    onFollowUpSubmit={handleFollowUpSubmit}
                    onRegenerate={handleRegenerate}
                  />
                  {isLoading && !isLoadingFromHistory && <TypingIndicator />}
                </>
              ) : (
                <div className="welcome-screen-container">
                  <div className="welcome-discover-section">
                    <EmptyState
                      agentName={selectedDatasetIds[0] ?? null}
                      onSubmit={handleStarterQuestion}
                    />
                  </div>
                  <div className="welcome-bottom-section">
                    {datasets.length > 0 && (
                      <div className="welcome-datasources">
                        <Database className="welcome-datasources-icon" />
                        <span>{datasets.length} data source{datasets.length !== 1 ? 's' : ''} available</span>
                      </div>
                    )}
                    <div className="welcome-input-wrapper">
                      <ChatInput
                        ref={welcomeChatInputRef}
                        {...commonChatInputProps}
                      />
                    </div>
                  </div>
                </div>
              )}

              {scrolled && !typing && isDesktop && (
                <button
                  onClick={() => mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: "smooth" })}
                  className="scroll-to-bottom-button"
                  aria-label="Scroll to bottom"
                >
                  <ChevronUp className="scroll-to-bottom-icon transform rotate-180" strokeWidth={2.5} />
                </button>
              )}
            </main>

            {/* Footer input — only shown when there are messages */}
            {chatHistory.length > 0 && (
              <div className="chatbox-input-section">
                <footer className="input-container">
                  <ChatInput
                    ref={chatInputRef}
                    {...commonChatInputProps}
                  />
                </footer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ChatBox;
