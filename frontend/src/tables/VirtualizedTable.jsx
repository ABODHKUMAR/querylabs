import * as React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import { TableVirtuoso } from 'react-virtuoso';

// Define columns for token_usage data
const columns = [
  { width: 150, label: 'Date', dataKey: 'DATE' },
  { width: 150, label: 'Prompt Tokens', dataKey: 'PROMPT_TOKENS', numeric: true },
  { width: 150, label: 'Completion Tokens', dataKey: 'COMPLETION_TOKENS', numeric: true },
  { width: 150, label: 'Total Tokens', dataKey: 'TOTAL_TOKENS', numeric: true },
  { width: 150, label: 'Total Cost ($)', dataKey: 'TOTAL_COST', numeric: true },
];

// Define MUI components for Virtuoso
const VirtuosoTableComponents = {
  Scroller: React.forwardRef((props, ref) => (
    <TableContainer component={Paper} {...props} ref={ref} />
  )),
  Table: (props) => (
    <Table
      {...props}
      sx={{
        borderCollapse: 'separate',
        tableLayout: 'fixed',
        fontFamily: 'Inter, sans-serif',
      }}
    />
  ),
  TableHead: React.forwardRef((props, ref) => <TableHead {...props} ref={ref} />),
  TableRow: (props) => (
    <TableRow
      {...props}
      hover
      sx={{
        '&:hover': {
          backgroundColor: '#f3f4f6',
        },
      }}
    />
  ),
  TableBody: React.forwardRef((props, ref) => <TableBody {...props} ref={ref} />),
};

// Render the fixed table header
function fixedHeaderContent() {
  return (
    <TableRow>
      {columns.map((column) => (
        <TableCell
          key={column.dataKey}
          align={column.numeric ? 'left' : 'left'}
          sx={{
            width: column.width,
            backgroundColor: '#f9fafb',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: '#374151',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          {column.label}
        </TableCell>
      ))}
    </TableRow>
  );
}

// Render each row of the table
function rowContent(_index, row) {
  return (
    <>
      {columns.map((column) => (
        <TableCell
          key={column.dataKey}
          align={column.numeric ? 'left' : 'left'}
          sx={{
            fontSize: '0.875rem',
            color: '#4b5563',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          {row[column.dataKey]}
        </TableCell>
      ))}
    </>
  );
}

// VirtualizedTable component that accepts token_usage data
const VirtualizedTable = ({ data }) => {
  return (
    <Paper
      elevation={3}
      sx={{
        height: '70vh',
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
      }}
    >
      <TableVirtuoso
        data={data}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={rowContent}
      />
    </Paper>
  );
};

export default VirtualizedTable;
