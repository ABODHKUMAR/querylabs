import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { ArrowUp, X, Database, FileText, Volume2, VolumeX, StopCircle } from "lucide-react";
import { fetchDataForQuery } from "../api/api";
import DatasetSelector from "./DatasetSelector";
import LoadingSpinner from "./LoadingSpinner";
import Dictaphone from "./Dictaphone";
import './ChatInput.css';
 
const ChatInput = forwardRef(({
  inputValue,
  setInputValue,
  isLoading,
  setIsLoading,
  selectedDatasetIds,
  datasets,
  toggleDatasetSelection,
  addToChatHistory,
  newChat,
  speakerEnable,
  setSpeakerEnable,
  chatHistory = [],
  sessionID,
  userID,
  // Streaming props - now passed from ChatBox (where useStreamingQuery lives)
  useStreaming = false,
  setUseStreaming,
  isStreaming = false,
  startStreaming,
  stopStreaming,
  status,
  thoughts = [],
  // MCP props
  mcpConfigs = [],
  setMCPConfigs,
  // Plan mode props
  fetchPlan = null,
  pendingQueryRef = null,
  isPlanPending = false,
}, ref) => {
  const textareaRef = useRef(null);

  // Plan mode toggle — backed by localStorage, default ON
  const [usePlanMode, setUsePlanMode] = useState(() => {
    const saved = localStorage.getItem('ql_plan_mode');
    return saved === null ? true : saved === 'true';
  });
  useEffect(() => {
    localStorage.setItem('ql_plan_mode', String(usePlanMode));
  }, [usePlanMode]);
  const dataSetsRef = useRef(null);
  const [showDatasetPopover, setShowDatasetPopover] = useState(false);

  const toggleVoiceOutput = () => {
    setSpeakerEnable(prev => {
      const newValue = !prev;
      return newValue;
    });
  };
  
  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close dataset popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dataSetsRef.current && !dataSetsRef.current.contains(event.target)) {
        setShowDatasetPopover(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  // Query submission
  const handleSubmit = useCallback(async (forcedQueryOrEvent) => {
    const forcedQuery = typeof forcedQueryOrEvent === 'string' ? forcedQueryOrEvent : null;
    const trimmedInput = (forcedQuery ?? inputValue).trim();
    if (!trimmedInput || isLoading || isStreaming) return;
    
    // Debug: Log streaming state
    console.log("[ChatInput] handleSubmit called:", {
      useStreaming,
      hasStartStreaming: !!startStreaming,
      isLoading,
      isStreaming,
    });
    
    console.log("session id for conversation - ", sessionID);
    setInputValue("");
    
    // Format conversation history for the API (query, response text, SQL, and table data)
    const formattedHistory = chatHistory
      .filter(msg => msg.query && (msg.response || msg.error))
      .map(msg => ({
        query: msg.query,
        response: msg.response || msg.error || "",
        data: msg.tableData ?? msg.data ?? null,
        sql_query: msg.sql_query || "",
      }));
    
    const payload = {
      query: trimmedInput,
      collection: selectedDatasetIds.join(","),
      sessionID: sessionID,
      userID: userID,
      mcpConfigs: mcpConfigs
    };
    
    // Plan mode: generate plan before execution
    if (usePlanMode && fetchPlan) {
      const lastEntry = chatHistory[chatHistory.length - 1];
      const previousPlanSteps = lastEntry?.planSnapshot?.editedSteps ?? null;
      const streamingTimestamp = new Date().toISOString();
      if (pendingQueryRef) {
        pendingQueryRef.current = { payload, formattedHistory, timestamp: streamingTimestamp };
      }
      addToChatHistory({
        query: trimmedInput,
        response: "",
        isPlanPending: true,
        isStreaming: false,
        timestamp: streamingTimestamp,
      });
      await fetchPlan(payload, formattedHistory, null, previousPlanSteps);
      return;
    }

    // Use streaming or regular mode based on setting
    console.log("[ChatInput] Checking streaming mode:", { useStreaming, hasStartStreaming: !!startStreaming });

    if (useStreaming && startStreaming) {
      console.log("[ChatInput] Using STREAMING mode");
      // Add placeholder for streaming message
      const streamingTimestamp = new Date().toISOString();
      addToChatHistory({
        query: trimmedInput,
        response: "",
        isStreaming: true,
        timestamp: streamingTimestamp,
      });
      
      // Start streaming - hook is now at ChatBox level, state persists across mounts
      startStreaming(
        payload,
        "querylab_sql", // model
        formattedHistory,
        // onComplete
        (response) => {
          // Update the streaming message with final response.
          // wasStreamed: true tells ChatMessages not to replay a typing animation
          // on this message — the text was already revealed live via streamingText.
          addToChatHistory({
            query: trimmedInput,
            tableData: response.data,
            sql_query: response.sql_query,
            citation: response.source,
            response: response.response,
            plotlyJson: response.plotlyJson,
            dataSources: response.dataSources || [],
            timestamp: streamingTimestamp,
            isStreaming: false,
            wasStreamed: true,
            thoughts: response.thoughts || [],
            artifacts: response.artifacts || [],
            traceId: response.traceId || '',
            followUpQuestions: response.followUpQuestions || [],
          });
          textareaRef.current?.focus();
        },
        // onError
        (error) => {
          addToChatHistory({
            query: trimmedInput,
            error: error?.message === 'Failed to fetch'
              ? 'Connection lost or request timed out. Please try again.'
              : (error?.message || 'Streaming failed. Please try again.'),
            timestamp: streamingTimestamp,
            isStreaming: false,
          });
          textareaRef.current?.focus();
        }
      );
    } else {
      // Regular non-streaming mode
      console.log("[ChatInput] Using REGULAR (non-streaming) mode");
      setIsLoading(true);
      try {
        const response = await fetchDataForQuery(payload, formattedHistory);

        addToChatHistory({
          query: trimmedInput,
          tableData: response.data,
          sql_query: response.sql_query,
          citation: response.source,
          response: response.response,
          plotlyJson: response.plotlyJson,
          dataSources: response.dataSources || [],
          timestamp: new Date().toISOString(),
          traceId: response.traceId || '',
          followUpQuestions: [],
        });
      } catch (error) {
        console.error("Error fetching data for query:", error);
        addToChatHistory({
          query: trimmedInput,
          error: "Failed to get response. Please try again.",
          timestamp: new Date().toISOString(),
        });
      } finally {
        setIsLoading(false);
        textareaRef.current?.focus();
      }
    }
  }, [
    inputValue,
    selectedDatasetIds,
    isLoading,
    isStreaming,
    setInputValue,
    setIsLoading,
    addToChatHistory,
    chatHistory,
    useStreaming,
    startStreaming,
    sessionID,
    userID,
    mcpConfigs,
    usePlanMode,
    fetchPlan,
    pendingQueryRef,
  ]);
  
  useImperativeHandle(ref, () => ({
    submit: (q) => handleSubmit(q),
  }), [handleSubmit]);

  // Handle stop streaming
  const handleStopStreaming = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  // Input handling functions
  const handleInputChange = useCallback(
    (e) => setInputValue(() => e.target.value),
    [setInputValue]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && !isPlanPending) {
          handleSubmit();
        }
      }
    },
    [handleSubmit, isStreaming, isPlanPending]
  );

  // Helper to get selected datasets
  const getSelectedDatasets = useCallback(
    () => datasets.filter((dataset) => selectedDatasetIds.includes(dataset.id)),
    [datasets, selectedDatasetIds]
  );

  // Component rendering
  return (
    <div className="chat-input-container">
      {/* Loading overlay - show for regular loading, not streaming */}
      {isLoading && !isStreaming && <LoadingOverlay />}
      
      {/* Streaming status indicator */}
      {isStreaming && status && (
        <div className="mb-2 px-3">
          <StreamingStatus status={status} />
        </div>
      )}

      {/* Selected dataset pills */}
      <SelectedDatasetPills
        selectedDatasets={getSelectedDatasets()}
        toggleDatasetSelection={toggleDatasetSelection}
      />

      <div className="chat-input-wrapper">
        {/* Text input area */}
        <textarea
          ref={textareaRef}
          rows={1}
          className={`chat-input-textarea ${
            newChat ? "h-32" : "h-20"
          }`}
          placeholder={isPlanPending ? "Review the plan above to continue." : "Ask about your business data..."}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading || isPlanPending}
        />

        {/* Action buttons */}
        <div className="chat-input-actions">
          {/* Dataset selector button */}
          <DatasetButton
            showPopover={showDatasetPopover}
            setShowPopover={setShowDatasetPopover}
            dataSetsRef={dataSetsRef}
            datasets={datasets}
            selectedDatasetIds={selectedDatasetIds}
            toggleDatasetSelection={toggleDatasetSelection}
          />

          {/* Voice controls - hidden */}
          <div className="voice-control-wrapper">
            <Dictaphone setInputValue={setInputValue} inputValue={inputValue} />
            <button
              onClick={toggleVoiceOutput}
              title={speakerEnable ? 'Disable voice response' : 'Enable voice response'}
              className={`voice-button ${
                speakerEnable ? 'voice-button-active' : ''
              }`}
            >
              {speakerEnable ? <Volume2 className="w-5 h-5" strokeWidth={2.5} /> : <VolumeX className="w-5 h-5" strokeWidth={2.5} />}
            </button>
            {/* Plan mode toggle */}
            <label
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title={usePlanMode ? 'Plan mode ON — click to disable' : 'Plan mode OFF — click to enable'}
            >
              <input
                type="checkbox"
                checked={usePlanMode}
                onChange={(e) => setUsePlanMode(e.target.checked)}
                className="w-3 h-3 accent-blue-600"
              />
              <span>Plan</span>
            </label>
          </div>
          
          {/* Stop button when streaming */}
          {isStreaming ? (
            <button
              onClick={handleStopStreaming}
              className="ml-2 p-2 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow"
              aria-label="Stop streaming"
              title="Stop streaming"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <SendButton
              isLoading={isLoading}
              isPlanPending={isPlanPending}
              inputValue={inputValue}
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </div>
  );
});

// Extracted sub-components
const LoadingOverlay = () => (
  <div className="loading-overlay">
    <LoadingSpinner />
  </div>
);

// Streaming status indicator component
const StreamingStatus = ({ status }) => {
  if (!status) return null;
  
  const stageMessages = {
    'starting': 'Starting...',
    'initializing': 'Initializing...',
    'preparing': 'Preparing AI agent...',
    'processing': 'Analyzing your question...',
    'tool_execution': status.message || 'Executing query...',
    'generating_response': 'Generating response...',
    'finalizing': 'Preparing final response...',
  };
  
  const message = stageMessages[status.stage] || status.message || 'Processing...';
  
  return (
    <div className="flex items-center gap-2 text-xs text-blue-600 animate-pulse">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
      <span>{message}</span>
    </div>
  );
};

const SelectedDatasetPills = ({ selectedDatasets, toggleDatasetSelection }) => {
  if (selectedDatasets.length === 0) return null;

  return (
    <div className="dataset-pills-container">
      {selectedDatasets.map((dataset) => {
        const IconComponent = dataset.name.toLowerCase().includes("sheets")
          ? FileText
          : Database;

        return (
          <div
            key={dataset.id}
            className="dataset-pill"
          >
            <IconComponent className="dataset-pill-icon" />
            <span className="dataset-pill-text">{dataset.name}</span>
            <X
              className="dataset-pill-remove"
              onClick={() => toggleDatasetSelection(dataset.id)}
            />
          </div>
        );
      })}
    </div>
  );
};

const DatasetButton = ({
  showPopover,
  setShowPopover,
  dataSetsRef,
  datasets,
  selectedDatasetIds,
  toggleDatasetSelection,
}) => (
  <div className="dataset-selector-wrapper">
    <button
      onClick={() => setShowPopover((prev) => !prev)}
      className={`dataset-button ${
        datasets.length === selectedDatasetIds.length
          ? "dataset-button-active"
          : ""
      }`}
      title="Select data sources"
      style={{ cursor: "pointer" }}
    >
      <Database className="w-5 h-5" strokeWidth={2.5} />
    </button>

    {showPopover && (
      <div
        ref={dataSetsRef}
        className="dataset-popover"
      >
        <DatasetSelector
          datasets={datasets}
          selectedDatasetIds={selectedDatasetIds}
          toggleDatasetSelection={toggleDatasetSelection}
        />
      </div>
    )}
  </div>
);

const SendButton = ({ isLoading, isPlanPending, inputValue, onSubmit }) => (
  <button
    onClick={onSubmit}
    disabled={isLoading || isPlanPending || !inputValue.trim()}
    className={`send-button ${
      inputValue.trim() && !isPlanPending
        ? "send-button-active"
        : "send-button-disabled"
    }`}
    aria-label="Send message"
  >
    <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
  </button>
);

export default ChatInput;
