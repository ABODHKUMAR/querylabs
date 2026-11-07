import axios from "axios";
import Cookies from "js-cookie";

// Docker builds bake placeholders (__VITE_*__) and docker-entrypoint.sh replaces them at runtime.
// Resolution order:
// 1) Same-origin /api when the page itself is HTTPS (nginx TLS) — never call http:// from https://
// 2) Explicit absolute VITE_BASE_URL (http/https) for local / direct IP access
// 3) Local/docker fallback http://host:port/api
function resolveBaseURL() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return `${window.location.origin}/api`;
  }
  const explicitBase = (import.meta.env.VITE_BASE_URL || "").trim();
  if (
    explicitBase &&
    !explicitBase.includes("__VITE_") &&
    /^https?:\/\//i.test(explicitBase)
  ) {
    return explicitBase.replace(/\/$/, "");
  }
  const host_url = import.meta.env.VITE_HOST_URL || "127.0.0.1";
  const backend_sql_port = import.meta.env.VITE_PORT_BACKEND_SQL || "8084";
  return `http://${host_url}:${backend_sql_port}/api`;
}

export const baseURL = resolveBaseURL();

/**
 * Fetches available data collections.
 * @returns {Promise<any[]>} List of data collections.
 */
export async function fetchDataCollections() {
  const authToken = Cookies.get("authToken");
  try {
    {/*teting api*/ }
    // @app.post("/api/data_source_testing")
    const response = await axios.get(`${baseURL}/data_source/`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      }
    });
    return response?.data?.response || [];
  } catch (error) {
    console.error("Error fetching data collections:", error);
    throw error;
  }
}

/**
 * Fetches master agent names (one per agent card, no sub-source expansion).
 * Used for the Analysis Plan AGENT(S) dropdown.
 * @returns {Promise<string[]>} List of master agent names.
 */
export async function fetchAgentNames() {
  const authToken = Cookies.get("authToken");
  try {
    const response = await axios.get(`${baseURL}/agent_names`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      }
    });
    return response?.data?.response || [];
  } catch (error) {
    console.error("Error fetching agent names:", error);
    return [];
  }
}

/**
 * Sends a query request and returns the response.
 * @param {Object} payload - The query payload.
 * @returns {Promise<any>} The query response.
 */
export async function fetchDataForQuery(payload, conversationHistory = []) {
  const authToken = Cookies.get("authToken");
  try {
    {/*teting api*/ }
    // @app.post("/api/test_response")
    const chatPayload = {
      query: payload.query || payload.prompt || "",
      collection: payload.collection,
      session_id: payload.sessionID,
      user_id: payload.userID,
      conversation_history: conversationHistory,
      mcp_servers: payload.mcpConfigs || []
    };
    const response = await axios.post(`${baseURL}/query`, chatPayload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      }
    });
    const finalResultResp = response?.data?.response || {}
    const chatResponse = finalResultResp?.response || "";
    const source = finalResultResp?.source || "";
    const sql_query = finalResultResp?.sql_query || "";
    const data = finalResultResp?.data || [];
    const plotlyJson = finalResultResp?.chart_vis || {};
    const dataSources = finalResultResp?.data_sources || [];
    const traceId = finalResultResp?.trace_id || "";
    return {
      response: chatResponse,
      data: data,
      sql_query: sql_query,
      source: source,
      plotlyJson: plotlyJson,
      dataSources: dataSources,
      traceId: traceId,
      followUpQuestions: [],
    };
  } catch (error) {
    console.error("Error fetching query data:", error);
    throw error;
  }
}

/**
 * Streams a query request using Server-Sent Events (SSE).
 * Provides real-time updates as the AI processes the query.
 * 
 * @param {Object} payload - The query payload
 * @param {Object} callbacks - Callback functions for different event types
 * @param {Function} callbacks.onStatus - Called with status updates
 * @param {Function} callbacks.onToken - Called with each token (for streaming text)
 * @param {Function} callbacks.onData - Called with data (SQL, tables, charts)
 * @param {Function} callbacks.onComplete - Called with final complete response
 * @param {Function} callbacks.onError - Called on errors
 * @param {string} model - Model to use ("querylab_sql" or "querylab_standard")
 * @param {Array} conversationHistory - Previous conversation messages
 * @returns {Function} Abort function to cancel the stream
 */
/**
 * Generates an analysis plan for user review before execution.
 * @param {Object} payload - Query payload (query, collection, sessionID, userID)
 * @param {Array} conversationHistory - Previous conversation messages
 * @param {string|null} regenerationFeedback - User feedback for plan regeneration
 * @param {Array|null} previousPlanSteps - Steps from the previous plan for follow-up queries
 * @param {string|null} clarificationAnswer - User's answer to a prior clarifying question
 * @param {boolean} skipClarification - User chose to skip the clarifying question
 * @returns {Promise<GeneratePlanResponse>} Plan with step_id, steps[], plan_id, or a
 *   needs_clarification/clarification_question pair when more info is needed first
 */
export async function generateAnalysisPlan(
  payload,
  conversationHistory = [],
  regenerationFeedback = null,
  previousPlanSteps = null,
  clarificationAnswer = null,
  skipClarification = false,
) {
  const authToken = Cookies.get("authToken");
  const body = {
    query: payload.query || payload.prompt || "",
    collection: payload.collection || "",
    session_id: payload.sessionID,
    user_id: payload.userID,
    conversation_history: conversationHistory,
    regeneration_feedback: regenerationFeedback || null,
    previous_plan_steps: previousPlanSteps || null,
    clarification_answer: clarificationAnswer || null,
    skip_clarification: !!skipClarification,
  };
  const response = await fetch(`${baseURL}/v3/query/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authToken ? `Bearer ${authToken}` : "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const status = response.status;
    if (status === 408 || status === 504) {
      throw new Error("Plan generation timed out. Try again or execute directly.");
    }
    if (status >= 500) {
      throw new Error("Plan service unavailable. Try again or execute directly.");
    }
    throw new Error(`Plan generation failed: HTTP ${status}`);
  }
  return response.json();
}

export function streamDataForQuery(payload, callbacks, model = "querylab_sql", conversationHistory = []) {
  // Uses baseURL defined at module level (same as other API functions)
  const authToken = Cookies.get("authToken");

  const controller = new AbortController();

  const chatPayload = {
    query: payload.query || payload.prompt || "",
    collection: payload.collection,
    session_id: payload.sessionID,
    user_id: payload.userID,
    conversation_history: conversationHistory,
    mcp_servers: payload.mcpConfigs || [],
    approved_plan: payload.approved_plan || null,
  };
  
  console.log('[Streaming] Starting stream request to:', `${baseURL}/v3/query/stream`);
  
  // Start the streaming request
  (async () => {
    try {
      const response = await fetch(`${baseURL}/v3/query/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken ? `Bearer ${authToken}` : '',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(chatPayload),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      console.log('[Streaming] Connection established, reading stream...');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let tokenCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[Streaming] Stream ended');
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events from buffer - split by double newline for complete events
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer
        
        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;
          
          const lines = eventBlock.split('\n');
          let eventType = null;
          let eventData = '';
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }
          
          if (eventType && eventData) {
            try {
              const data = JSON.parse(eventData);
              
              switch (eventType) {
                case 'status':
                  console.log('[Streaming] Status:', data.stage, data.message);
                  callbacks.onStatus?.(data);
                  break;
                case 'thought':
                  console.log('[Streaming] Thought:', data.type, data.content);
                  callbacks.onThought?.(data);
                  break;
                case 'insight':
                  console.log('[Streaming] Insight:', data.insights?.length, 'insights received');
                  callbacks.onInsight?.(data.insights || []);
                  break;
                case 'token':
                  tokenCount++;
                  // Log every 10 tokens to avoid console spam
                  if (tokenCount % 10 === 0) {
                    console.log('[Streaming] Tokens received:', tokenCount);
                  }
                  callbacks.onToken?.(data.content);
                  break;
                case 'data':
                  console.log('[Streaming] Data event:', data.type);
                  callbacks.onData?.(data);
                  break;
                case 'complete':
                  console.log('[Streaming] Complete event received');
                  callbacks.onComplete?.(data);
                  break;
                case 'plan_step_status':
                  callbacks.onPlanStepStatus?.(data);
                  break;
                case 'error':
                  console.error('[Streaming] Error event:', data.message);
                  callbacks.onError?.(new Error(data.message));
                  break;
                default:
                  console.log('[Streaming] Unknown event:', eventType, data);
              }
            } catch (parseError) {
              console.error('[Streaming] Parse error:', parseError, 'Data:', eventData);
            }
          }
        }
      }
      
      console.log('[Streaming] Total tokens received:', tokenCount);
      
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[Streaming] Error:', error);
        callbacks.onError?.(error);
      }
    }
  })();
  
  // Return abort function
  return () => {
    console.log('[Streaming] Aborting stream');
    controller.abort();
  };
}

/**
 * Sends a login request using user credentials.
 * @param {{ user_id: string, password: string }} credentials - User login info.
 * @returns {Promise<any>} Login response data.
 */
export async function login({ user_id, password }) {
  try {
    const response = await axios.post(
      `${baseURL}/login`,
      { user_id, password },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Login Success:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "Login Error:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

/**
 * Logout: notify backend (stateless JWT) then clear client session.
 * Always clears local auth even if the API call fails.
 */
export async function logout() {
  try {
    await axios.post(`${baseURL}/logout`, {}, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Stateless JWT — client-side clear is enough if API is unreachable
    console.warn("Logout API call failed (continuing local clear):", error?.message || error);
  }
}


/**
 * fetch all conversations for hist_id
 * @param {String} hist_id 
 * @returns {Promise<any>} The query response.
 */
export async function fetchConversations(histID, setUserID, setSessionID) { 
  const authToken = Cookies.get("authToken");
  try {
    const payload = {
      "hist_id": histID,
    }
    let allHistUrl = `${baseURL}/history/conversations`;
    const response = await axios.post(allHistUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      }
    });
    const conv = response?.data?.conversations.items || []
    const userId = response?.data?.conversations?.user_id
    const sessionID = response?.data?.conversations?.session_id
    console.log("conv:", conv, "isArray:", Array.isArray(conv));
    const formattedConversations = conv
      .filter(item => (item.context.response.query || item.context.response.prompt || "").trim() !== "")
      .map(item => ({
        query: item.context.response.query || item.prompt || "",
        timestamp: item.msg_dttm || new Date().toISOString(),
        response: item.context.response.response || "",
        tableData: item.context.response.data || [],
        sql_query: item.context.response.sql_query || "",
        source: item.context.response.source || "",
        thoughts: item.context.response.thoughts || "",
        plotlyJson: item.context.response.chart_vis || {},
        dataSources: item.context.response.data_sources || []
      }));
    console.log("formattedConversations:", formattedConversations, "isArray:", Array.isArray(formattedConversations));
    setUserID(userId)
    console.log("setting the session id - ", sessionID)
    setSessionID(sessionID)
    return formattedConversations

  } catch (error) {
    console.error("Error fetching history: ", error);
    throw error;
  }
}

/**
 * fetch all conversation hisrty for user and session
 * @param {String} userID 
 * @param {String} sessionID 
 * @returns {Promise<any>} The query response.
 */
export async function fetchAllHistory(userID, sessionID) {
  const authToken = Cookies.get("authToken");
  try {
    const payload = {
      "user_id": userID,
      "session_id": sessionID
    }
    let allHistUrl = `${baseURL}/history/all`;
    const response = await axios.post(allHistUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken ? `Bearer ${authToken}` : "",
      }
    });
    console.log("conv:", response?.data?.history, "isArray:", Array.isArray(response?.data?.history));
    return response?.data?.history || {}

  } catch (error) {
    console.error("Error fetching history: ", error);
    throw error;
  }
}

export async function patchHistoryTitle(histId, title) {
  const authToken = Cookies.get("authToken");
  return axios.patch(`${baseURL}/history/${histId}/title`, { title }, {
    headers: {
      "Content-Type": "application/json",
      Authorization: authToken ? `Bearer ${authToken}` : "",
    },
  });
}

export async function patchHistoryPin(histId) {
  const authToken = Cookies.get("authToken");
  return axios.patch(`${baseURL}/history/${histId}/pin`, {}, {
    headers: {
      Authorization: authToken ? `Bearer ${authToken}` : "",
    },
  });
}

export async function datasourceToggleApi(conn_id, toggledState) {
  const authToken = Cookies.get("authToken");
  const headers = {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : "",
  };
  const payload = {
    "conn_id": conn_id,
    "is_active": toggledState
  }
  try {
    const response = await axios.post(`${baseURL}/settings/connection/toggle`, payload, {headers})
    console.info("datasourceToggleApi", response)
    return response
  } catch (error) {
    console.error("Unexpected error in datashourceToggleApi:", error);
    throw error;
  }

}

export async function postFeedback(traceId, rating) {
  const authToken = Cookies.get("authToken");
  return fetch(`${baseURL}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authToken ? `Bearer ${authToken}` : "",
    },
    body: JSON.stringify({ trace_id: traceId, rating }),
  });
}

export async function GetCredentials() {
  const authToken = Cookies.get("authToken");
  const headers = {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : "",
  };

  try {
    const [res1, res2, res3] = await Promise.allSettled([
      axios.get(`${baseURL}/settings/connection/all`, { headers }),
      axios.get(`${baseURL}/settings/llm/all`, { headers }),
      axios.get(`${baseURL}/settings/daily_tokens`, { headers }),
    ]);

    const connections_models_token_usage = {
      Database_Connections: res1.status === "fulfilled" ? res1.value.data.connections || [] : [],
      LLM_Model_Connections: res2.status === "fulfilled" ? res2.value.data.models || [] : [],
      Token_Usage: res3.status === "fulfilled" ? res3.value.data.token_usage || [] : [],
    };

    // Optionally log errors
    if (res1.status === "rejected") {
      console.error("Query Labs API Error:", res1.reason.response?.data || res1.reason.message);
    }
    if (res2.status === "rejected") {
      console.error("Snowflake API Error:", res2.reason.response?.data || res2.reason.message);
    }
    if (res3.status === "rejected") {
      console.error("Weaviate API Error:", res3.reason.response?.data || res3.reason.message);
    }
    console.log("connections_models_token_usage...", connections_models_token_usage);
    return connections_models_token_usage;

  } catch (error) {
    console.error("Unexpected error in GetAllConnection:", error);
    throw error;
  }
}


export async function createConnection(db_type, config, metaCredentials) {
  const authToken = Cookies.get("authToken");

  const headers = {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : "",
  };

  try {
    const response = await axios.post(
      `${baseURL}/settings/connection/create`,
      {
        DB_TYPE: db_type,
        metadata_config: metaCredentials,
        config: config,
      },
      { headers }
    );

    return response.data;
  } catch (error) {
    console.error("Create Connection Error:", error.response?.data || error.message);
    throw error;
  }
}
export async function updateConnection(conn_id_value, db_type, config, metaCredentials) {
  const authToken = Cookies.get("authToken");

  const headers = {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : "",
  };


  const { name, provider, description, location, ...updatedConfig } = config;

  try {
    const response = await axios.post(
      `${baseURL}/settings/connection/update`,
      {
        connection: {
          DB_TYPE: db_type,
          conn_id: conn_id_value,
          metadata_config: metaCredentials,
          config: updatedConfig,
        },
        conn_id: conn_id_value
      },
      { headers }
    );

    return response.data;
  } catch (error) {
    console.error("Update Connection Error:", error.response?.data || error.message);
    throw error;
  }
}

/**
 * Tests an MCP server connection and returns available tools.
 * @param {Object} config - The MCP server configuration
 * @returns {Promise<{success: boolean, message: string, tools: Array}>} Test result
 */
export async function testMCPConnection(config) {
  const authToken = Cookies.get("authToken");
  
  try {
    const response = await axios.post(
      `${baseURL}/v3/test-mcp`,
      { config },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken ? `Bearer ${authToken}` : "",
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Test MCP Connection Error:", error.response?.data || error.message);
    // Return error response instead of throwing
    return {
      success: false,
      message: error.response?.data?.detail || error.message || "Connection failed",
      tools: null
    };
  }
}

// --- Agent workspace (orchestrator /api/workspace/*, JWT) ---

function workspaceHeaders() {
  const authToken = Cookies.get("authToken");
  return {
    "Content-Type": "application/json",
    Authorization: authToken ? `Bearer ${authToken}` : "",
  };
}

export async function workspaceListAgents() {
  const { data } = await axios.get(`${baseURL}/workspace/agents`, { headers: workspaceHeaders() });
  return data;
}

export async function workspaceCreateAgent(name) {
  const { data } = await axios.post(
    `${baseURL}/workspace/agents`,
    { name: String(name).trim() },
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceDeleteAgent(agentName, confirm) {
  const { data } = await axios.delete(`${baseURL}/workspace/agents/${encodeURIComponent(agentName)}`, {
    headers: workspaceHeaders(),
    data: { confirm },
  });
  return data;
}

export async function workspaceAgentTree(agentName) {
  const { data } = await axios.get(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/tree`,
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceCreateSkillDir(agentName, skillType) {
  const { data } = await axios.post(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/skill-types`,
    { skill_type: String(skillType).trim() },
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceGetInstruction(agentName) {
  const { data } = await axios.get(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/instruction`,
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspacePutInstruction(agentName, content) {
  const { data } = await axios.put(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/instruction`,
    { content: content ?? "" },
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceDeleteInstruction(agentName) {
  const { data } = await axios.delete(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/instruction`,
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceGetSkillFile(agentName, skillType, filename) {
  const { data } = await axios.get(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/skill-types/${encodeURIComponent(skillType)}/files/${encodeURIComponent(filename)}`,
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspacePutSkillFile(agentName, skillType, filename, content) {
  const { data } = await axios.put(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/skill-types/${encodeURIComponent(skillType)}/files/${encodeURIComponent(filename)}`,
    { content: content ?? "" },
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceCreateSkillFile(agentName, skillType, filename, content) {
  const { data } = await axios.post(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/skill-types/${encodeURIComponent(skillType)}/files`,
    { filename, content: content ?? "" },
    { headers: workspaceHeaders() }
  );
  return data;
}

export async function workspaceDeleteSkillFile(agentName, skillType, filename) {
  const { data } = await axios.delete(
    `${baseURL}/workspace/agents/${encodeURIComponent(agentName)}/skill-types/${encodeURIComponent(skillType)}/files/${encodeURIComponent(filename)}`,
    { headers: workspaceHeaders() }
  );
  return data;
}

/**
 * LLM draft/refine for AGENT.md or skill .md (orchestrator format).
 * @param {Object} payload - { kind: 'agent_md'|'skill_md', user_prompt, agent_name, skill_type_dir?, skill_name?, mode?, current_content? }
 */
export async function workspaceGenerate(payload) {
  const { data } = await axios.post(`${baseURL}/workspace/generate`, payload, {
    headers: workspaceHeaders(),
  });
  return data;
}

/**
 * List all generic skills from the shared .skills/ library.
 * @returns {Promise<{skills: Array, count: number}>}
 */
export async function workspaceListSkills() {
  const { data } = await axios.get(`${baseURL}/skills`, { headers: workspaceHeaders() });
  return data;
}

/**
 * List all registered MCP servers from the central registry.
 * @param {string} [type] - Optional filter by server type (sql|vector|search|file)
 * @returns {Promise<{servers: Array, count: number}>}
 */
export async function workspaceListMCPRegistry(type) {
  const params = type ? { type } : {};
  const { data } = await axios.get(`${baseURL}/mcp/registry`, { headers: workspaceHeaders(), params });
  return data;
}

