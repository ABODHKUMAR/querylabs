import * as React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import "./TableDataSet.css";

export const TableDataSet = ({tableData = []}) => {
  const flattenedData = tableData.length > 0 ? tableData : [];
  
  // Generate columns from the first row of data
  const columns = flattenedData.length > 0 
    ? Object.keys(flattenedData[0]).map((key) => ({
        field: key,
        headerName: key,
        minWidth: 150,
        flex: 1,
        sortable: true,
        filterable: true,
        headerClassName: 'data-grid-header',
        headerAlign: 'center',
        align: 'center',
      }))
    : [];

  // Add unique IDs to rows for DataGrid
  const rows = flattenedData.map((row, index) => ({
    id: index,
    ...row,
  }));

  return (
    <Box className='data-grid-container'>
      <Paper elevation={0} sx={{ height: 400, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 10 },
            },
          }}
          pageSizeOptions={[5, 10, 25, 50]}
          disableRowSelectionOnClick
          sx={{
            border: '1px solid #e5e7eb',
            '& .MuiDataGrid-cell': {
              borderRight: '1px solid #f3f4f6',
              color: '#374151',
              fontSize: '0.875rem',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: '#f9fafb',
              borderBottom: '2px solid #e5e7eb',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 700,
              color: '#1f2937',
              fontSize: '0.875rem',
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: '#f3f4f6',
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb',
            },
            '& .MuiTablePagination-root': {
              color: '#374151',
            },
          }}
        />
      </Paper>
    </Box>
  );
};
