import * as Tooltip from '@radix-ui/react-tooltip';
import React, { useState } from "react";
import { testMCPConnection } from "../api/api";
import {
  Plug,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Pencil,
  Code,
  Settings,
  Loader2,
  CheckCircle,
  XCircle,
  Zap
} from "lucide-react";
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Box,
  Collapse,
  IconButton,
  Switch,
  Checkbox,
  FormControlLabel,
  CircularProgress
} from '@mui/material';
import './MCPSelector.css';

const TRANSPORT_OPTIONS = [
  { value: 'http', label: 'HTTP', description: 'HTTP-based MCP server' },
  { value: 'sse', label: 'SSE', description: 'Server-Sent Events' },
  { value: 'websocket', label: 'WebSocket', description: 'WebSocket connection' },
  { value: 'stdio', label: 'stdio', description: 'Local command (npx, uvx, etc.)' },
];

const MCPSelector = ({
  mcpConfigs = [],
  setMCPConfigs,
  onRemoveMCP,
}) => {
  const [showOptions, setShowOptions] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMCP, setEditingMCP] = useState(null);
  const [activeTab, setActiveTab] = useState(0); // 0 = Form, 1 = JSON
  const [formError, setFormError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message, tools }
  const [availableTools, setAvailableTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]); // empty = all selected

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    transport: 'http',
    url: '',
    command: '',
    args: '',
    headers: '',
    env: '',
    description_prefix: '',
    description_postfix: '',
  });

  // JSON state (for advanced tab)
  const [jsonInput, setJsonInput] = useState('');

  const resetForm = () => {
    setFormData({
      name: '',
      transport: 'http',
      url: '',
      command: '',
      args: '',
      headers: '',
      env: '',
      description_prefix: '',
      description_postfix: '',
    });
    setJsonInput('');
    setFormError('');
    setShowAdvanced(false);
    setActiveTab(0);
    setIsTesting(false);
    setTestResult(null);
    setAvailableTools([]);
    setSelectedTools([]);
  };

  const formDataToConfig = () => {
    const config = {
      name: formData.name.trim(),
      transport: formData.transport,
    };

    if (formData.transport === 'stdio') {
      config.command = formData.command.trim();
      if (formData.args.trim()) {
        try {
          config.args = JSON.parse(formData.args.trim());
        } catch {
          config.args = formData.args.trim().split(/\s+/).filter(Boolean);
        }
      } else {
        config.args = [];
      }
      if (formData.env.trim()) {
        try {
          config.env = JSON.parse(formData.env.trim());
        } catch {
          setFormError('Invalid JSON in Environment Variables');
          return null;
        }
      }
    } else {
      config.url = formData.url.trim();
      if (formData.headers.trim()) {
        try {
          config.headers = JSON.parse(formData.headers.trim());
        } catch {
          setFormError('Invalid JSON in Headers');
          return null;
        }
      }
    }

    if (formData.description_prefix.trim()) {
      config.description_prefix = formData.description_prefix.trim();
    }
    if (formData.description_postfix.trim()) {
      config.description_postfix = formData.description_postfix.trim();
    }

    // Add selected tools if not all are selected
    if (availableTools.length > 0 && selectedTools.length > 0 && selectedTools.length < availableTools.length) {
      config.selected_tools = selectedTools;
    }

    return config;
  };

  const configToFormData = (config) => {
    return {
      name: config.name || '',
      transport: config.transport || 'http',
      url: config.url || '',
      command: config.command || '',
      args: config.args ? (Array.isArray(config.args) ? JSON.stringify(config.args) : config.args) : '',
      headers: config.headers ? JSON.stringify(config.headers, null, 2) : '',
      env: config.env ? JSON.stringify(config.env, null, 2) : '',
      description_prefix: config.description_prefix || '',
      description_postfix: config.description_postfix || '',
    };
  };

  const handleOpenAddModal = () => {
    setEditingMCP(null);
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = (mcp) => {
    setEditingMCP(mcp.name);
    setFormData(configToFormData(mcp));
    setJsonInput(JSON.stringify(mcp, null, 2));
    setFormError('');
    setShowAdvanced(Boolean(mcp.headers || mcp.env));
    setActiveTab(0);
    setIsTesting(false);
    setTestResult(null);
    // Restore selected tools if previously tested
    if (mcp.selected_tools && mcp.selected_tools.length > 0) {
      setSelectedTools(mcp.selected_tools);
    } else {
      setSelectedTools([]);
    }
    setAvailableTools([]);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingMCP(null);
    resetForm();
  };

  const validateConfig = (config) => {
    if (!config.name) {
      return 'Server name is required';
    }
    if (!config.transport) {
      return 'Transport type is required';
    }
    if (config.transport === 'stdio' && !config.command) {
      return 'Command is required for stdio transport';
    }
    if (['http', 'sse', 'websocket'].includes(config.transport) && !config.url) {
      return 'URL is required for this transport type';
    }
    
    const existingNames = mcpConfigs
      .filter(c => c.name !== editingMCP)
      .map(c => c.name);
    if (existingNames.includes(config.name)) {
      return `Server with name "${config.name}" already exists`;
    }
    
    return null;
  };

  const handleTestConnection = async () => {
    let config = activeTab === 0 ? formDataToConfig() : null;
    
    if (activeTab === 1) {
      try {
        config = JSON.parse(jsonInput);
      } catch (e) {
        setFormError('Invalid JSON');
        return;
      }
    }
    
    if (!config) return;
    
    const error = validateConfig(config);
    if (error) {
      setFormError(error);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setFormError('');

    try {
      const result = await testMCPConnection(config);
      setTestResult(result);
      
      if (result.success && result.tools) {
        setAvailableTools(result.tools);
        // Select all tools by default
        setSelectedTools(result.tools.map(t => t.name));
      }
    } catch (e) {
      setTestResult({ success: false, message: `Request failed: ${e.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleTool = (toolName) => {
    setSelectedTools(prev => {
      if (prev.includes(toolName)) {
        return prev.filter(t => t !== toolName);
      } else {
        return [...prev, toolName];
      }
    });
  };

  const handleSelectAllTools = () => {
    setSelectedTools(availableTools.map(t => t.name));
  };

  const handleDeselectAllTools = () => {
    setSelectedTools([]);
  };

  const handleSave = () => {
    let config;
    
    if (activeTab === 0) {
      // Form mode
      config = formDataToConfig();
      if (!config) return; // Error already set
    } else {
      // JSON mode
      try {
        config = JSON.parse(jsonInput);
      } catch (e) {
        setFormError(`Invalid JSON: ${e.message}`);
        return;
      }
    }

    const error = validateConfig(config);
    if (error) {
      setFormError(error);
      return;
    }

    if (editingMCP) {
      setMCPConfigs(mcpConfigs.map(c => 
        c.name === editingMCP ? config : c
      ));
    } else {
      setMCPConfigs([...mcpConfigs, config]);
    }
    
    handleCloseModal();
  };

  const handleRemoveMCP = (name, e) => {
    e.stopPropagation();
    if (onRemoveMCP) {
      onRemoveMCP(name);
    } else {
      setMCPConfigs(mcpConfigs.filter(c => c.name !== name));
    }
  };

  const handleToggleMCP = (name, e) => {
    e.stopPropagation();
    setMCPConfigs(mcpConfigs.map(c => 
      c.name === name ? { ...c, enabled: !c.enabled } : c
    ));
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const handleTabChange = (event, newValue) => {
    if (newValue === 1 && activeTab === 0) {
      // Switching from Form to JSON - sync data
      const config = formDataToConfig();
      if (config) {
        setJsonInput(JSON.stringify(config, null, 2));
      }
    } else if (newValue === 0 && activeTab === 1) {
      // Switching from JSON to Form - sync data
      try {
        const config = JSON.parse(jsonInput);
        setFormData(configToFormData(config));
      } catch {
        // Keep current form data if JSON is invalid
      }
    }
    setActiveTab(newValue);
    setFormError('');
  };

  const loadExample = (type) => {
    const examples = {
      http: {
        name: 'context7',
        transport: 'http',
        url: 'https://mcp.context7.com/mcp',
        headers: '',
        description_prefix: 'Use this for documentation lookups.',
      },
      sse: {
        name: 'local-server',
        transport: 'sse',
        url: 'http://localhost:8000/sse',
      },
      stdio: {
        name: 'fetch-server',
        transport: 'stdio',
        command: 'npx',
        args: '["-y", "@anthropic/mcp-server-fetch"]',
      },
    };
    
    const example = examples[type];
    if (example) {
      setFormData(prev => ({ ...prev, ...configToFormData(example) }));
      if (activeTab === 1) {
        setJsonInput(JSON.stringify(example, null, 2));
      }
    }
  };

  return (
    <div className="mcp-selector-container">
      <div 
        className="mcp-selector-header"
        onClick={() => setShowOptions(prev => !prev)}
      >
        <span>MCP Servers</span>
        {showOptions ? 
          <ChevronUp className="mcp-selector-header-icon" /> : 
          <ChevronDown className="mcp-selector-header-icon" />
        }
      </div>

      {showOptions && (
        <div className="mcp-options-container">
          {mcpConfigs.length > 0 ? (
            mcpConfigs.map((mcp) => {
              const isEnabled = mcp.enabled !== false;
              return (
              <div
                key={mcp.name}
                className={`mcp-item mcp-item-clickable ${!isEnabled ? 'mcp-item-disabled' : ''}`}
                onClick={() => handleOpenEditModal(mcp)}
                title="Click to edit"
              >
                <div className="mcp-item-content">
                  <Switch
                    size="small"
                    checked={isEnabled}
                    onChange={(e) => handleToggleMCP(mcp.name, e)}
                    onClick={(e) => e.stopPropagation()}
                    sx={{ 
                      marginRight: '0.25rem',
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#22c55e',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#22c55e',
                      },
                    }}
                  />
                  <Plug className={`mcp-item-icon ${!isEnabled ? 'mcp-icon-disabled' : ''}`} />
                  
                  <Tooltip.Provider>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <span className={`mcp-item-name ${!isEnabled ? 'mcp-name-disabled' : ''}`}>
                          {mcp.name}
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="mcp-tooltip"
                          side="top"
                          sideOffset={5}
                        >
                          <div className="mcp-tooltip-content">
                            <strong>{mcp.name}</strong>
                            <span className={`mcp-tooltip-status ${isEnabled ? 'mcp-status-enabled' : 'mcp-status-disabled'}`}>
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <span className="mcp-tooltip-transport">
                              {mcp.transport === 'stdio' ? mcp.command : mcp.url}
                            </span>
                            {mcp.headers && (
                              <span className="mcp-tooltip-auth">Auth headers configured</span>
                            )}
                            {(mcp.description_prefix || mcp.description_postfix) && (
                              <span className="mcp-tooltip-desc">Tool hints configured</span>
                            )}
                            <span className="mcp-tooltip-hint">Click to edit</span>
                          </div>
                          <Tooltip.Arrow className="mcp-tooltip-arrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>

                  <span className="mcp-transport-badge">
                    {mcp.transport}
                  </span>
                </div>
                <div className="mcp-item-actions">
                  <button 
                    className="mcp-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(mcp);
                    }}
                    title="Edit MCP"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button 
                    className="mcp-remove-btn"
                    onClick={(e) => handleRemoveMCP(mcp.name, e)}
                    title="Remove MCP"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );})
          ) : (
            <div className="mcp-empty">No MCP servers configured</div>
          )}

          <button
            className="mcp-add-btn"
            onClick={handleOpenAddModal}
          >
            <Plus className="w-4 h-4" />
            <span>Add MCP Server</span>
          </button>
        </div>
      )}

      <Dialog 
        open={showModal} 
        onClose={handleCloseModal}
        maxWidth="md"
        fullWidth
        className="mcp-dialog"
        PaperProps={{
          sx: {
            borderRadius: '1.25rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
          }
        }}
      >
        <DialogTitle className="mcp-dialog-title">
          <span className="mcp-dialog-title-text">
            {editingMCP ? 'Edit MCP Server' : 'Add MCP Server'}
          </span>
          <X 
            className="mcp-dialog-close"
            onClick={handleCloseModal}
          />
        </DialogTitle>
        <DialogContent className="mcp-dialog-content">
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            className="mcp-tabs"
            sx={{ marginBottom: 2 }}
          >
            <Tab 
              icon={<Settings className="w-4 h-4" />} 
              iconPosition="start" 
              label="Form" 
            />
            <Tab 
              icon={<Code className="w-4 h-4" />} 
              iconPosition="start" 
              label="JSON" 
            />
          </Tabs>
          
          {formError && (
            <div className="mcp-json-error">
              <AlertCircle className="w-4 h-4" />
              <span>{formError}</span>
            </div>
          )}

          {activeTab === 0 ? (
            // Form Tab
            <div className="mcp-form">
              <TextField
                fullWidth
                size="small"
                label="Server Name"
                value={formData.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                placeholder="e.g., my-mcp-server"
                required
                sx={{ marginBottom: 2 }}
              />

              <FormControl fullWidth size="small" sx={{ marginBottom: 2 }}>
                <InputLabel>Transport Type</InputLabel>
                <Select
                  value={formData.transport}
                  label="Transport Type"
                  onChange={(e) => handleFormChange('transport', e.target.value)}
                >
                  {TRANSPORT_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <div className="mcp-transport-option">
                        <span>{opt.label}</span>
                        <span className="mcp-transport-desc">{opt.description}</span>
                      </div>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {formData.transport === 'stdio' ? (
                // stdio fields
                <>
                  <TextField
                    fullWidth
                    size="small"
                    label="Command"
                    value={formData.command}
                    onChange={(e) => handleFormChange('command', e.target.value)}
                    placeholder="e.g., npx, uvx, python"
                    required
                    sx={{ marginBottom: 2 }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Arguments"
                    value={formData.args}
                    onChange={(e) => handleFormChange('args', e.target.value)}
                    placeholder='e.g., ["-y", "@anthropic/mcp-server-fetch"] or space-separated'
                    helperText="JSON array or space-separated arguments"
                    sx={{ marginBottom: 2 }}
                  />
                </>
              ) : (
                // URL-based transports
                <TextField
                  fullWidth
                  size="small"
                  label="URL"
                  value={formData.url}
                  onChange={(e) => handleFormChange('url', e.target.value)}
                  placeholder="e.g., https://mcp.example.com/mcp"
                  required
                  sx={{ marginBottom: 2 }}
                />
              )}

              {/* Tool Hints Section */}
              <div className="mcp-section-header">
                <span>Tool Hints (Optional)</span>
              </div>
              <p className="mcp-section-hint">
                Help the AI understand when to use tools from this server
              </p>
              <TextField
                fullWidth
                size="small"
                label="Description Prefix"
                value={formData.description_prefix}
                onChange={(e) => handleFormChange('description_prefix', e.target.value)}
                placeholder="e.g., Use this tool when the user asks about documentation..."
                sx={{ marginBottom: 2 }}
              />
              <TextField
                fullWidth
                size="small"
                label="Description Postfix"
                value={formData.description_postfix}
                onChange={(e) => handleFormChange('description_postfix', e.target.value)}
                placeholder="e.g., Only use for library-related queries."
                sx={{ marginBottom: 2 }}
              />

              {/* Advanced Section */}
              <div 
                className="mcp-advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>Advanced Settings</span>
              </div>
              
              <Collapse in={showAdvanced}>
                <div className="mcp-advanced-section">
                  {formData.transport === 'stdio' ? (
                    <TextField
                      fullWidth
                      size="small"
                      label="Environment Variables (JSON)"
                      value={formData.env}
                      onChange={(e) => handleFormChange('env', e.target.value)}
                      placeholder='{"API_KEY": "your-key"}'
                      multiline
                      rows={3}
                      sx={{ fontFamily: 'monospace' }}
                    />
                  ) : (
                    <TextField
                      fullWidth
                      size="small"
                      label="Headers (JSON)"
                      value={formData.headers}
                      onChange={(e) => handleFormChange('headers', e.target.value)}
                      placeholder='{"Authorization": "Bearer xxx"}'
                      multiline
                      rows={3}
                      sx={{ fontFamily: 'monospace' }}
                    />
                  )}
                </div>
              </Collapse>

              {/* Quick Examples */}
              {!editingMCP && (
                <div className="mcp-examples">
                  <p className="mcp-examples-title">Load example:</p>
                  <div className="mcp-example-tabs">
                    <button 
                      className="mcp-example-tab"
                      onClick={() => loadExample('http')}
                    >
                      HTTP (Context7)
                    </button>
                    <button 
                      className="mcp-example-tab"
                      onClick={() => loadExample('sse')}
                    >
                      SSE (Local)
                    </button>
                    <button 
                      className="mcp-example-tab"
                      onClick={() => loadExample('stdio')}
                    >
                      stdio (npx)
                    </button>
                  </div>
                </div>
              )}

              {/* Test Connection */}
              <div className="mcp-test-section">
                <Button
                  variant="outlined"
                  onClick={handleTestConnection}
                  disabled={isTesting || !formData.name || (formData.transport !== 'stdio' && !formData.url) || (formData.transport === 'stdio' && !formData.command)}
                  startIcon={isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  className="mcp-test-btn"
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </Button>
                
                {testResult && (
                  <div className={`mcp-test-result ${testResult.success ? 'mcp-test-success' : 'mcp-test-failure'}`}>
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Available Tools */}
              {availableTools.length > 0 && (
                <div className="mcp-tools-section">
                  <div className="mcp-tools-header">
                    <span className="mcp-tools-title">Available Tools ({selectedTools.length}/{availableTools.length} selected)</span>
                    <div className="mcp-tools-actions">
                      <button 
                        className="mcp-tools-action-btn"
                        onClick={handleSelectAllTools}
                      >
                        Select All
                      </button>
                      <button 
                        className="mcp-tools-action-btn"
                        onClick={handleDeselectAllTools}
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                  <div className="mcp-tools-list">
                    {availableTools.map(tool => (
                      <div key={tool.name} className="mcp-tool-item">
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedTools.includes(tool.name)}
                              onChange={() => handleToggleTool(tool.name)}
                              size="small"
                            />
                          }
                          label={
                            <div className="mcp-tool-label">
                              <span className="mcp-tool-name">{tool.name}</span>
                              <span className="mcp-tool-desc">{tool.description}</span>
                            </div>
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // JSON Tab
            <div className="mcp-json-tab">
              <TextField
                multiline
                rows={14}
                fullWidth
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  setFormError('');
                }}
                placeholder="Enter MCP config JSON..."
                variant="outlined"
                className="mcp-json-input"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }
                }}
              />
            </div>
          )}
        </DialogContent>
        <DialogActions className="mcp-dialog-actions">
          <Button onClick={handleCloseModal} color="inherit" className="mcp-modal-btn">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary" className="mcp-modal-btn">
            {editingMCP ? 'Save Changes' : 'Add Server'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default MCPSelector;
