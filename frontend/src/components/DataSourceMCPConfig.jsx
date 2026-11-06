import React, { useState, useEffect } from 'react';
import {
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  IconButton,
  Collapse,
  CircularProgress,
  Chip,
  Switch,
  Tooltip,
  Box,
} from '@mui/material';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Zap,
  Settings,
  CheckCircle,
  XCircle,
  Loader2,
  Library,
} from 'lucide-react';
import { testMCPConnection, workspaceListMCPRegistry } from '../api/api';

const TRANSPORT_OPTIONS = [
  { value: 'http', label: 'HTTP', description: 'HTTP-based MCP server' },
  { value: 'sse', label: 'SSE', description: 'Server-Sent Events' },
  { value: 'websocket', label: 'WebSocket', description: 'WebSocket connection' },
  { value: 'stdio', label: 'stdio', description: 'Local command (npx, uvx)' },
];

const MCPServerCard = ({
  server,
  index,
  onUpdate,
  onRemove,
  onTest,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [localServer, setLocalServer] = useState(server);

  const handleFieldChange = (field, value) => {
    const updated = { ...localServer, [field]: value };
    setLocalServer(updated);
    onUpdate(index, updated);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(localServer);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 mb-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className={localServer.enabled !== false ? "text-green-500" : "text-gray-400"} />
          <span className="font-medium text-sm">{localServer.name || 'Unnamed Server'}</span>
          <Chip
            label={localServer.transport || 'http'}
            size="small"
            variant="outlined"
            className="text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          <Tooltip title={localServer.enabled !== false ? "Enabled" : "Disabled"}>
            <Switch
              size="small"
              checked={localServer.enabled !== false}
              onChange={(e) => handleFieldChange('enabled', e.target.checked)}
            />
          </Tooltip>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
          <IconButton size="small" onClick={() => onRemove(index)} color="error">
            <Trash2 size={16} />
          </IconButton>
        </div>
      </div>

      <Collapse in={expanded}>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Server Name"
              size="small"
              fullWidth
              value={localServer.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Transport</InputLabel>
              <Select
                value={localServer.transport || 'http'}
                onChange={(e) => handleFieldChange('transport', e.target.value)}
                label="Transport"
              >
                {TRANSPORT_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>

          {localServer.transport === 'stdio' ? (
            <>
              <TextField
                label="Command"
                size="small"
                fullWidth
                placeholder="npx, uvx, python, etc."
                value={localServer.command || ''}
                onChange={(e) => handleFieldChange('command', e.target.value)}
              />
              <TextField
                label="Arguments"
                size="small"
                fullWidth
                placeholder='["-y", "@mcp/server-name"] or space-separated'
                value={localServer.args || ''}
                onChange={(e) => handleFieldChange('args', e.target.value)}
                helperText="JSON array or space-separated"
              />
              <TextField
                label="Environment Variables"
                size="small"
                fullWidth
                multiline
                rows={2}
                placeholder='{"VAR": "value"}'
                value={localServer.env || ''}
                onChange={(e) => handleFieldChange('env', e.target.value)}
                helperText="JSON object"
              />
            </>
          ) : (
            <>
              <TextField
                label="URL"
                size="small"
                fullWidth
                placeholder="https://api.example.com/mcp"
                value={localServer.url || ''}
                onChange={(e) => handleFieldChange('url', e.target.value)}
              />
              <TextField
                label="Headers"
                size="small"
                fullWidth
                multiline
                rows={2}
                placeholder='{"Authorization": "Bearer ..."}'
                value={localServer.headers || ''}
                onChange={(e) => handleFieldChange('headers', e.target.value)}
                helperText="JSON object for auth headers"
              />
            </>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outlined"
              size="small"
              onClick={handleTest}
              disabled={testing}
              startIcon={testing ? <CircularProgress size={14} /> : <Settings size={14} />}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            {testResult && (
              <div className={`flex items-center gap-1 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {testResult.message}
              </div>
            )}
          </div>

          {testResult?.success && testResult.tools && (
            <div className="mt-2 p-2 bg-green-50 rounded text-sm">
              <Typography variant="caption" className="font-medium">
                Available Tools ({testResult.tools.length}):
              </Typography>
              <div className="flex flex-wrap gap-1 mt-1">
                {testResult.tools.slice(0, 5).map((tool, i) => (
                  <Chip key={i} label={tool.name || tool} size="small" variant="outlined" />
                ))}
                {testResult.tools.length > 5 && (
                  <Chip label={`+${testResult.tools.length - 5} more`} size="small" />
                )}
              </div>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
};


const DataSourceMCPConfig = ({
  mcpServers = [],
  onMCPServersChange,
  collapsible = true,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [registryServers, setRegistryServers] = useState([]);
  const [registryByType, setRegistryByType] = useState({});
  const [showRegistry, setShowRegistry] = useState(false);

  useEffect(() => {
    workspaceListMCPRegistry()
      .then((d) => {
        const servers = d.servers || [];
        setRegistryServers(servers);
        const byType = servers.reduce((acc, srv) => {
          const t = srv.type || 'other';
          if (!acc[t]) acc[t] = [];
          acc[t].push(srv);
          return acc;
        }, {});
        setRegistryByType(byType);
      })
      .catch(() => {
        setRegistryServers([]);
        setRegistryByType({});
      });
  }, []);

  const handleAddFromRegistry = (registrySrv) => {
    // Don't add if already configured
    if (mcpServers.some((s) => s.name === registrySrv.name)) return;
    const newServer = {
      name: registrySrv.name,
      transport: registrySrv.transport || 'http',
      url: registrySrv.url || '',
      command: registrySrv.command || '',
      args: registrySrv.args ? JSON.stringify(registrySrv.args) : '',
      env: registrySrv.env ? JSON.stringify(registrySrv.env) : '',
      enabled: true,
    };
    onMCPServersChange([...mcpServers, newServer]);
  };

  const isAlreadyAdded = (name) => mcpServers.some((s) => s.name === name);

  const handleAddServer = () => {
    const newServer = {
      name: `mcp-server-${mcpServers.length + 1}`,
      transport: 'http',
      url: '',
      enabled: true,
    };
    onMCPServersChange([...mcpServers, newServer]);
  };

  const handleUpdateServer = (index, updatedServer) => {
    const updated = [...mcpServers];
    updated[index] = updatedServer;
    onMCPServersChange(updated);
  };

  const handleRemoveServer = (index) => {
    onMCPServersChange(mcpServers.filter((_, i) => i !== index));
  };

  const handleTestServer = async (server) => {
    try {
      const config = {
        name: server.name,
        transport: server.transport,
      };

      if (server.transport === 'stdio') {
        config.command = server.command;
        config.args = typeof server.args === 'string' 
          ? (server.args.startsWith('[') 
              ? JSON.parse(server.args) 
              : server.args.split(/\s+/).filter(Boolean))
          : server.args || [];
        if (server.env) {
          config.env = typeof server.env === 'string' ? JSON.parse(server.env) : server.env;
        }
      } else {
        config.url = server.url;
        if (server.headers) {
          config.headers = typeof server.headers === 'string' 
            ? JSON.parse(server.headers) 
            : server.headers;
        }
      }

      const result = await testMCPConnection(config);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const content = (
    <div className="mt-2">
      {/* Registry picker */}
      {registryServers.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mb-2"
            onClick={() => setShowRegistry((v) => !v)}
          >
            <Library size={14} />
            {showRegistry ? 'Hide' : 'Browse'} MCP Registry ({registryServers.length} servers)
            {showRegistry ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showRegistry && (
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3 max-h-60 overflow-y-auto">
              {Object.entries(registryByType).map(([type, servers]) => (
                <div key={type}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{type}</div>
                  <div className="space-y-1">
                    {servers.map((srv) => (
                      <div key={srv.name} className="flex items-center justify-between bg-white border border-gray-100 rounded px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{srv.name}</div>
                          {(srv.url || srv.command) && (
                            <div className="text-xs text-gray-400 font-mono truncate">{srv.url || srv.command}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isAlreadyAdded(srv.name)}
                          onClick={() => handleAddFromRegistry(srv)}
                          className="ml-2 shrink-0 text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-40 disabled:cursor-default"
                        >
                          {isAlreadyAdded(srv.name) ? 'Added' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mcpServers.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-sm">
          <Zap className="mx-auto mb-2 text-gray-400" size={24} />
          <p>No MCP servers configured for this data source.</p>
          <p className="text-xs">Add MCP servers to extend SQL capabilities with external tools.</p>
        </div>
      ) : (
        mcpServers.map((server, index) => (
          <MCPServerCard
            key={index}
            server={server}
            index={index}
            onUpdate={handleUpdateServer}
            onRemove={handleRemoveServer}
            onTest={handleTestServer}
          />
        ))
      )}

      <Button
        variant="outlined"
        size="small"
        onClick={handleAddServer}
        startIcon={<Plus size={14} />}
        className="mt-2"
        fullWidth
      >
        Add MCP Server
      </Button>
    </div>
  );

  if (!collapsible) {
    return (
      <div className="mcp-config-section">
        <Typography variant="subtitle1" className="mb-2 font-semibold flex items-center gap-2">
          <Zap size={18} /> MCP Tools (Optional)
        </Typography>
        <Typography variant="caption" color="textSecondary" className="block mb-2">
          Add MCP servers to extend this data source with external tools.
        </Typography>
        {content}
      </div>
    );
  }

  return (
    <div className="mcp-config-section border-t pt-4 mt-4">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="subtitle1" className="font-semibold flex items-center gap-2">
          <Zap size={18} className={mcpServers.length > 0 ? "text-green-500" : "text-gray-400"} />
          MCP Tools
          {mcpServers.length > 0 && (
            <Chip 
              label={`${mcpServers.length} configured`} 
              size="small" 
              color="primary" 
              variant="outlined"
            />
          )}
        </Typography>
        <IconButton size="small">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </IconButton>
      </div>
      
      <Collapse in={expanded}>
        <Typography variant="caption" color="textSecondary" className="block mb-2">
          Add MCP servers to extend this data source with external tools (file access, web search, etc.)
        </Typography>
        {content}
      </Collapse>
    </div>
  );
};

export default DataSourceMCPConfig;
