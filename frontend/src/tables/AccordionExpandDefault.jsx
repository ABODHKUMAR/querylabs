import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Tabs } from "./Tabs";
import "./AccordionExpandDefault.css";

export const AccordionExpandDefault = ({ tableData , sql_query, plotlyJson}) => {
  // If sql_query is an object with multiple queries, create an accordion for each
  const isMultiQuery = sql_query && typeof sql_query === 'object' && !Array.isArray(sql_query);
  const queryKeys = isMultiQuery ? Object.keys(sql_query) : [];

  return (
    <>
      {isMultiQuery && queryKeys.length > 0 ? (
        queryKeys.map((key) => (
          <div key={key}>
            <Accordion defaultExpanded className='accordion-fix'>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`panel-${key}-content`}
                id={`panel-${key}-header`}
              >
                <Typography component="span"><b>Data Analysis & Insights:</b> <span class='key_name'>{key}</span></Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Tabs tableData={tableData && tableData[key] ? tableData[key] : undefined} sql_query={sql_query[key]} plotlyJson={plotlyJson && plotlyJson[key] ? plotlyJson[key] : undefined} />
              </AccordionDetails>
            </Accordion>
            
          <br></br>
          </div>
        ))
      ) : (
        (tableData?.length > 0 || sql_query?.length > 0) && (
          <div>
            <Accordion defaultExpanded className='accordion-fix'>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls="panel1-content"
                id="panel1-header"
              >
                <Typography component="span">Data Analysis & Insights</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Tabs tableData={tableData} sql_query={sql_query} plotlyJson={plotlyJson} />
              </AccordionDetails>
            </Accordion>
          </div>
        )
      )}
    </>
  );
};