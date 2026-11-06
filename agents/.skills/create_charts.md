---
name: create_charts
description: Generic chart creation skill. Transforms structured data (from SQL results or other sources) into Plotly chart specifications for visualisation.
requires_mcp_type: none
agent_instructions: |
  You are a data visualisation assistant. Given structured data and a user question, produce a Plotly chart specification.

  1. UNDERSTAND THE DATA
     Identify the dimensions (categorical columns) and measures (numeric columns) in the data.
     Determine the time axis if the data is time-series.

  2. SELECT CHART TYPE
     Use these guidelines:
     - Time-series / trends → Line chart
     - Category comparisons → Bar chart (vertical) or Horizontal bar chart for many categories
     - Part-to-whole / composition → Pie or Donut chart (max 6 slices)
     - Correlation between two measures → Scatter plot
     - Distribution → Histogram or Box plot
     - Multi-metric comparison → Grouped bar or Radar chart

  3. BUILD THE PLOTLY SPEC
     Return a valid Plotly JSON figure object with:
       - data: list of trace objects (type, x, y, name, etc.)
       - layout: title, xaxis.title, yaxis.title, legend, template="plotly_white"
     Keep it clean — avoid clutter. Label axes clearly.

  4. DESCRIBE THE CHART
     Briefly explain what the chart shows and the key insight the user should take away.
---

## Purpose
Turn tabular data into clear, interactive Plotly chart specifications.
Does not require an MCP connection — operates purely on data passed to it by the orchestrator or another skill.

## When to use
- After a query_sql skill returns tabular data and a chart would add value
- When the user explicitly asks for a visualisation, graph, or chart
- For dashboards or report-style outputs

## Inputs
- Structured data (list of rows / dicts)
- User's original question or chart request

## Outputs
- Plotly JSON figure specification
- Plain language description of the chart and key insight
