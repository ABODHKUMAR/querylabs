import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import { TableDataSet } from './TableDataSet';
import { SqlQuery } from './SqlQuery';
import PlotlyChartSet from './PlotlyChartSet';

export const Tabs = ({ tableData, sql_query, plotlyJson }) => {
  let initialTab;
  if (tableData?.length > 0) {
    initialTab = "1";
  } else if (sql_query?.length > 0) {
    initialTab = "2";
  }  else if (Object.keys(plotlyJson).length > 0) {
    initialTab = "3";
  } 
  // else if (thoughts?.length > 0) {
  //   initialTab = "3";
  // } 
  else {
    initialTab = undefined;
  }
  const [value, setValue] = useState(initialTab);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ width: '100%', typography: 'body1' }}>
      {value && ( // Ensure value is defined before rendering
        <TabContext value={value}>
          <Box>
            <TabList onChange={handleChange} aria-label="lab API tabs example">
              {tableData && <Tab label="Data" value="1" />}
              { sql_query && <Tab label="SQL Query" value="2"/>}
              { plotlyJson && Object.keys(plotlyJson).length > 0 && <Tab label="Chart" value="3"/>}
            </TabList>
          </Box>
          {
            tableData && 
            <TabPanel value="1">
              <TableDataSet tableData={tableData} />
            </TabPanel>
          }
          {
            sql_query && 
            <TabPanel value="2">
            <SqlQuery sql_query={sql_query}/>
          </TabPanel>
          }
          {
            plotlyJson && Object.keys(plotlyJson).length > 0 && 
            <TabPanel value="3">
            <PlotlyChartSet plotlyJson={plotlyJson}/>
          </TabPanel>
          }
        </TabContext>
      )}
    </Box>
  );
};
