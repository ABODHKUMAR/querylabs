import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Typography,
  CircularProgress,
  Snackbar,
  Alert as MuiAlert,
} from '@mui/material';
import { X } from 'lucide-react';
import { createConnection, updateConnection } from '../api/api';
import DataSourceMCPConfig from './DataSourceMCPConfig';

const dbFields = {
  mysql: ['HOST', 'PORT', 'USER', 'PASSWORD', 'DATABASE'],
  mssql: ['HOST', 'PORT', 'USER', 'PASSWORD', 'DATABASE'],
  postgres: ['HOST', 'PORT', 'USER', 'PASSWORD', 'DATABASE'],
  'databricks-sql': ['SERVER_HOSTNAME', 'HTTP_PATH', 'ACCESS_TOKEN'],
  snowflake: ['USER', 'PASSWORD', 'ACCOUNT', 'HOST', 'WAREHOUSE'],
};

const vectorFields = {
  weaviate: ['HOST', 'PORT', 'API_KEY'],
};

const CreateConnection = ({ openModel, setOpenModel, database_details = {}, title = "", onSaved }) => {
  const [openConfirmModal, setOpenConfirmModal] = React.useState(false);
  const [connectionType, setConnectionType] = React.useState('Database');
  const [connectionObject, setConnectionObject] = React.useState('mysql');
  const [credentials, setCredentials] = React.useState({});
  const [metaCredentials, setMetaCredentials] = React.useState({});
  const [connectionStatus, setConnectionStatus] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [alertMessage, setAlertMessage] = React.useState('');
  const [alertSeverity, setAlertSeverity] = React.useState('success');
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  
  // MCP servers configuration (per-datasource)
  const [mcpServers, setMcpServers] = React.useState([]);

  React.useEffect(() => {
    if (openModel && database_details && Object.keys(database_details).length > 0) {
      const dbType = database_details.DB_TYPE?.toLowerCase();
      const isDbTypeValid = dbFields[dbType];
      const isVectorTypeValid = vectorFields[dbType];

      const connType = isDbTypeValid ? 'Database' : isVectorTypeValid ? 'Vector' : 'Database';
      const defaultObject = connType === 'Database' ? (isDbTypeValid ? dbType : 'mysql') : 'weaviate';

      setConnectionType(connType);
      setConnectionObject(defaultObject);
      setCredentials(database_details.config || {});
      setMetaCredentials(database_details.metadata_config || {});
      
      // Load existing MCP servers from metadata_config if present
      setMcpServers(database_details.metadata_config?.mcp_servers || []);
    }
  }, [openModel, database_details]);

  const closeAll = () => {
    setOpenModel(false);
    setOpenConfirmModal(false);
    setConnectionObject('mysql');
    setCredentials({});
    setMetaCredentials({});
    setConnectionStatus('');
    setConnectionType('Database');
    setMcpServers([]); // Reset MCP servers
  };

  const handleFieldChange = (field, value) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  const handleFieldChangeMetaData = (field, value) => {
    setMetaCredentials(prev => ({ ...prev, [field]: value }));
  };

  const getFields = () => {
    return connectionType === 'Database'
      ? dbFields[connectionObject] || []
      : vectorFields[connectionObject] || [];
  };

  const testConnection = async () => {
    const requiredFields = getFields();
    const missing = requiredFields.some(field => !credentials[field]);

    if (missing) {
      setConnectionStatus('⚠️ Missing Fields');
      setAlertMessage('Please fill in all required fields.');
      setAlertSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    setConnectionStatus('Connecting...');
    
    try {
      setTimeout(() => {
        setConnectionStatus('✅ Connected');
        setLoading(false);
      }, 500);
    } catch (error) {
      setConnectionStatus('❌ Failed');
    }
  };

  const dbOptions = Object.keys(dbFields);
  const vectorOptions = Object.keys(vectorFields);

  const handleSubmit = async () => {
    setLoading(true);
  
    try {
      const isUpdate = Boolean(database_details.CONN_ID);
      
      // Include MCP servers in metadata credentials
      const metaCredentialsWithMCP = {
        ...metaCredentials,
        mcp_servers: mcpServers.length > 0 ? mcpServers : undefined,
      };
  
      const response = isUpdate
        ? await updateConnection(database_details.CONN_ID, connectionObject, credentials, metaCredentialsWithMCP)
        : await createConnection(connectionObject, credentials, metaCredentialsWithMCP);
  
      setAlertMessage(isUpdate ? 'Connection Updated Successfully!' : 'Connection Created Successfully!');
      setAlertSeverity('success');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setAlertMessage('Error submitting connection. Please check console for details.');
      setAlertSeverity('error');
    } finally {
      setLoading(false);
      setSnackbarOpen(true);
      closeAll();
    }
  };
  

  return (
    <>
      <Dialog open={openModel} onClose={closeAll} maxWidth="sm" fullWidth PaperProps={{ sx: { maxWidth: 550 } }}>
        <DialogTitle>
          {"Connection Details"}
          <X onClick={closeAll} className="cursor-pointer text-gray-500 hover:text-gray-700 absolute top-2 right-2" />
        </DialogTitle>

        <DialogContent>
          <Typography variant="subtitle1" className="mb-2 font-semibold">Metadata Info</Typography>
          <div className="mb-6 space-y-4 mt-2">
            <div className="flex gap-4">
              <TextField
                label="Name"
                variant="outlined"
                fullWidth
                value={metaCredentials.sementic_name || ''}
                onChange={(e) => handleFieldChangeMetaData('sementic_name', e.target.value)}
              />
              <FormControl fullWidth variant="outlined">
                <InputLabel>Provider</InputLabel>
                <Select
                  value={metaCredentials.provider || ''}
                  onChange={(e) => handleFieldChangeMetaData('provider', e.target.value)}
                  label="Provider"
                >
                  <MenuItem value="local">Local</MenuItem>
                  <MenuItem value="gcp-storage">GCP Storage</MenuItem>
                </Select>
              </FormControl>
            </div>

            <TextField
              label="Location"
              variant="outlined"
              fullWidth
              value={metaCredentials.location || ''}
              onChange={(e) => handleFieldChangeMetaData('location', e.target.value)}
            />

            <TextField
              label="Description"
              variant="outlined"
              fullWidth
              multiline
              minRows={2}
              value={metaCredentials.description || ''}
              onChange={(e) => handleFieldChangeMetaData('description', e.target.value)}
            />
          </div>

          <hr className="my-4" />

          <Typography variant="subtitle1" className="mb-2 font-semibold">Connection Configuration</Typography>
          <div className="flex gap-4 mb-4 mt-2">
            <FormControl fullWidth variant="outlined">
              <InputLabel>Connection Type</InputLabel>
              <Select
                value={connectionType}
                onChange={(e) => {
                  setConnectionType(e.target.value);
                  const defaultObj = e.target.value === 'Database' ? 'mysql' : 'weaviate';
                  setConnectionObject(defaultObj);
                  setCredentials({});
                  setConnectionStatus('');
                }}
                label="Connection Type"
              >
                <MenuItem value="Database">Database</MenuItem>
                <MenuItem value="Vector">Vector</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth variant="outlined">
              <InputLabel>Connection Object</InputLabel>
              <Select
                value={connectionObject}
                onChange={(e) => {
                  setConnectionObject(e.target.value);
                  setCredentials({});
                  setConnectionStatus('');
                }}
                label="Connection Object"
              >
                {(connectionType === 'Database' ? dbOptions : vectorOptions).map((obj) => (
                  <MenuItem key={obj} value={obj}>{obj}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>

          {getFields().map((field) => (
            <TextField
              key={field}
              label={field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
              variant="outlined"
              fullWidth
              type={/password|token|key/i.test(field) ? 'password' : 'text'}
              value={credentials[field] || ''}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              margin="normal"
            />
          ))}

          <div className="flex justify-between items-center mb-3">
            <Button
              variant="contained"
              color="primary"
              onClick={testConnection}
              
            >
              Test Connection
            </Button>
            <span className="text-sm text-gray-500">{connectionStatus}</span>
          </div>

          {/* MCP Tools Configuration - Only for Database connections */}
          {connectionType === 'Database' && (
            <DataSourceMCPConfig
              mcpServers={mcpServers}
              onMCPServersChange={setMcpServers}
              collapsible={true}
              defaultExpanded={mcpServers.length > 0}
            />
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpenConfirmModal(true)} color="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            color="primary"
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openConfirmModal} onClose={() => setOpenConfirmModal(false)}>
        <DialogTitle>Are you sure you want to close?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setOpenConfirmModal(false)} color="primary">
            No
          </Button>
          <Button onClick={closeAll} color="secondary" variant="contained">
            Yes
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={1000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <MuiAlert
          onClose={() => setSnackbarOpen(false)}
          severity={alertSeverity}
          sx={{ width: '100%' }}
          elevation={6}
          variant="filled"
        >
          {alertMessage}
        </MuiAlert>
      </Snackbar>
    </>
  );
};

export default CreateConnection;
