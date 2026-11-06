import { useState, useCallback, useRef, useEffect } from 'react';
import { streamDataForQuery } from '../../api/api';

/**
 * Custom hook for streaming query responses with SSE.
 * Provides real-time token streaming and status updates.
 * 
 * @returns {Object} Hook state and functions
 */
export function useStreamingQuery() {
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState(null);
  const [thoughts, setThoughts] = useState([]); // Track thought process
  const [insights, setInsights] = useState([]); // Track detailed insights
  const [streamingData, setStreamingData] = useState({
    sql_query: {},
    data: {},
    chart_vis: {},
  });
  
  // Ref to abort controller
  const abortRef = useRef(null);
  // Buffer for incoming tokens — flushed to state once per animation frame
  const pendingTokensRef = useRef('');
  const rafRef = useRef(null);

  // Abort stream and cancel pending RAF on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  
  /**
   * Start streaming a query
   * @param {Object} payload - Query payload
   * @param {string} model - Model to use
   * @param {Array} conversationHistory - Previous messages
   * @param {Function} onComplete - Callback when complete
   * @param {Function} onError - Callback on error
   */
  const startStreaming = useCallback((
    payload,
    model,
    conversationHistory,
    onComplete,
    onError,
    approvedPlan = null,
    onPlanStepStatus = null,
  ) => {
    // Reset state
    setIsStreaming(true);
    setStreamingText('');
    setStatus({ stage: 'starting', message: 'Starting...' });
    setThoughts([]);
    setInsights([]);
    setStreamingData({ sql_query: {}, data: {}, chart_vis: {} });
    // Clear any pending token buffer from a previous stream
    pendingTokensRef.current = '';
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    // Merge approved_plan into payload so streamDataForQuery forwards it
    const payloadWithPlan = approvedPlan
      ? { ...payload, approved_plan: approvedPlan }
      : payload;

    // Start streaming
    const abort = streamDataForQuery(
      payloadWithPlan,
      {
        onPlanStepStatus: (data) => {
          onPlanStepStatus?.(data);
        },

        onStatus: (statusData) => {
          setStatus(statusData);
        },
        
        onThought: (thoughtData) => {
          // Add thought to the list
          setThoughts(prev => [...prev, {
            ...thoughtData,
            timestamp: Date.now(),
          }]);
        },
        
        onInsight: (insightList) => {
          // Replace insights with the full list
          setInsights(insightList);
        },
        
        onToken: (token) => {
          // Buffer token; flush to state on the next animation frame so React
          // renders at most once per ~16 ms rather than once per token.
          pendingTokensRef.current += token;
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              const pending = pendingTokensRef.current;
              if (pending) {
                pendingTokensRef.current = '';
                setStreamingText(prev => prev + pending);
              }
            });
          }
        },
        
        onData: (dataEvent) => {
          const isPartial = dataEvent.partial === true;
          const isFinal = dataEvent.final === true;
          console.log(`[useStreamingQuery] Data event: ${dataEvent.type}, partial=${isPartial}, final=${isFinal}`);
          
          setStreamingData(prev => {
            const updated = { ...prev };
            
            if (dataEvent.type === 'sql_query') {
              updated.sql_query = { ...prev.sql_query, ...dataEvent.content };
            } else if (dataEvent.type === 'table_data') {
              updated.data = { ...prev.data, ...dataEvent.content };
              // Log partial data arrival for progressive display
              if (isPartial) {
                const keys = Object.keys(dataEvent.content);
                console.log(`[useStreamingQuery] Partial table data received for: ${keys.join(', ')}`);
              }
            } else if (dataEvent.type === 'chart') {
              updated.chart_vis = { ...prev.chart_vis, ...dataEvent.content };
              if (isPartial) {
                const keys = Object.keys(dataEvent.content);
                console.log(`[useStreamingQuery] Partial chart received for: ${keys.join(', ')}`);
              }
            }
            
            return updated;
          });
        },
        
        onComplete: (response) => {
          // Capture current thoughts before resetting state
          // Use functional update to get the latest thoughts value
          setThoughts(currentThoughts => {
            setIsStreaming(false);
            setStatus(null);

            // Format final response - include current thoughts and artifacts
            const finalResponse = {
              response: response.response,
              data: response.data || {},
              sql_query: response.sql_query || {},
              source: response.source || '',
              plotlyJson: response.chart_vis || {},
              thoughts: currentThoughts,
              artifacts: response.artifacts || [],
              dataSources: response.data_sources || [],
              traceId: response.trace_id || '',
              followUpQuestions: response.follow_up_questions || [],
            };

            onComplete?.(finalResponse);

            // Return the same thoughts (don't modify)
            return currentThoughts;
          });
        },
        
        onError: (error) => {
          setIsStreaming(false);
          setStatus(null);
          console.error('Streaming error:', error);
          onError?.(error);
        },
      },
      model,
      conversationHistory
    );
    
    abortRef.current = abort;
  }, []);
  
  /**
   * Stop/abort the current stream
   */
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    // Cancel any pending RAF flush
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingTokensRef.current = '';
    setIsStreaming(false);
    setStatus(null);
  }, []);
  
  /**
   * Reset streaming state
   */
  const resetStreaming = useCallback(() => {
    setStreamingText('');
    setStatus(null);
    setThoughts([]);
    setInsights([]);
    setStreamingData({ sql_query: {}, data: {}, chart_vis: {} });
  }, []);
  
  return {
    // State
    isStreaming,
    streamingText,
    status,
    thoughts,
    insights,
    streamingData,
    
    // Actions
    startStreaming,
    stopStreaming,
    resetStreaming,
  };
}

export default useStreamingQuery;
