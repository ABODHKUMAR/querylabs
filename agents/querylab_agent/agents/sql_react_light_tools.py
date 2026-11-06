"""
Light SQL ReAct tools: generate_sql, fix_sql, evaluate_query only.

Discovery (get_schema, get_table_details) and execution (execute_sql) come from MCP;
these in-code tools handle reasoning. Schema context is provided by the agent
(from MCP get_schema output) and passed into generate_sql / evaluate_query / fix_sql.
"""
import json
from typing import Any, Dict, List, Optional

from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from querylab_agent.agents.time_context import current_date_context


# ----- Output schemas for parsing -----
class GenerateSQLOutput(BaseModel):
    query: str = Field(description="The generated SQL query")


class EvaluationItem(BaseModel):
    comment: str = Field(description="Concise comment about query quality")
    groundness: float = Field(description="Score 0-10 for grounding in schema")
    correctness: float = Field(description="Score 0-10 for correctness")


class EvaluationOutput(BaseModel):
    evaluations: List[EvaluationItem] = Field(description="List of evaluations")


# ----- Prompts (aligned with backend_sql logic) -----
GENERATE_SQL_PROMPT = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template("""
{current_date_context}

You are an expert in creating SQL for database: {db_type}

1. Understand the user's question
2. Identify key information, filters, joins, aggregations, ordering
3. Use question_understanding and query_generation_plan
4. Use ONLY information from relevant_schema_details (tables, columns, relationships, sample values)
5. Follow DB constraints: {db_constraints}
6. Generate only SELECT queries; use exact table/column names from schema
7. For any relative time phrase ("this quarter", "last month", "YTD"), compute the concrete
   date/quarter from the current date above — do not use a year from the question_understanding
   or query_generation_plan text unless the user explicitly stated that year.

question_understanding:
{question_understanding}

query_generation_plan:
{query_generation_plan}

relevant_schema_details:
{relevant_schema_details}

User question:
{user_question}

{format_instructions}
"""),
])

EVALUATE_QUERY_PROMPT = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template("""
You are an evaluation model judging groundedness and correctness of a SQL query.

Schema context: {schema}
Question: {question}
SQL Query: {sql_query}

Generate a few evaluations. For each: comment, groundness (0-10), correctness (0-10).

{format_instructions}
"""),
])

FIX_SQL_PROMPT = ChatPromptTemplate.from_messages([
    SystemMessagePromptTemplate.from_template("""
You are an expert SQL analyst for {db_type}.

Fix the following SQL that failed with an error. Use the schema context.

Schema: {metadata}
Previous Query: {previous_sql}
Error: {error_message}

Return ONLY the corrected SQL as JSON: {format_instructions}
"""),
])


def create_light_sql_tools(
    llm: Any,
    db_type: str = "Mysql",
    db_constraints: Optional[str] = None,
) -> List[Any]:
    """
    Create only generate_sql, fix_sql, evaluate_query (no discovery, no execute).
    Discovery and execute are provided by MCP tools.
    """
    generate_parser = JsonOutputParser(pydantic_object=GenerateSQLOutput)
    evaluation_parser = JsonOutputParser(pydantic_object=EvaluationOutput)
    db_constraints = db_constraints or ""

    @tool
    def generate_sql(
        user_question: str,
        relevant_schema_details: str,
        question_understanding: Optional[str] = None,
        query_generation_plan: Optional[str] = None,
    ) -> str:
        """Generate a SQL query from the user question and schema.
        Call get_schema (MCP) first and pass its output as relevant_schema_details."""
        try:
            prompt = GENERATE_SQL_PROMPT.format(
                current_date_context=current_date_context(),
                db_type=db_type,
                db_constraints=db_constraints,
                question_understanding=question_understanding or "From schema and question.",
                query_generation_plan=query_generation_plan or "Build SELECT with filters/joins/aggregations as needed.",
                relevant_schema_details=relevant_schema_details,
                user_question=user_question,
                format_instructions=generate_parser.get_format_instructions(),
            )
            result = llm.invoke(prompt)
            parsed = generate_parser.parse(result.content)
            sql_query = parsed.get("query", "")
            return json.dumps({"sql_query": sql_query, "status": "success"})
        except Exception as e:
            return json.dumps({"sql_query": None, "status": "error", "error": str(e)})

    @tool
    def evaluate_query(
        sql_query: str,
        user_question: str,
        schema_context: Optional[str] = None,
    ) -> str:
        """Evaluate SQL quality (groundness and correctness). Pass schema from get_schema as schema_context."""
        schema_context = schema_context or "Schema not provided."
        try:
            prompt = EVALUATE_QUERY_PROMPT.format(
                schema=schema_context,
                question=user_question,
                sql_query=sql_query,
                format_instructions=evaluation_parser.get_format_instructions(),
            )
            result = llm.invoke(prompt)
            evaluation = evaluation_parser.parse(result.content)
            evaluations = evaluation.get("evaluations", [])
            if evaluations:
                avg_ground = sum(e.get("groundness", 0) for e in evaluations) / len(evaluations)
                avg_correct = sum(e.get("correctness", 0) for e in evaluations) / len(evaluations)
                feedback = evaluations[0].get("comment", "")
            else:
                avg_ground = avg_correct = 10.0
                feedback = "Unable to evaluate"
            return json.dumps({
                "groundness": round(avg_ground, 2),
                "correctness": round(avg_correct, 2),
                "feedback": feedback,
                "status": "success",
            })
        except Exception as e:
            return json.dumps({
                "groundness": 10.0,
                "correctness": 10.0,
                "feedback": str(e),
                "status": "error",
            })

    @tool
    def fix_sql(
        sql_query: str,
        error_message: str,
        schema_context: Optional[str] = None,
    ) -> str:
        """Fix a SQL query that failed. Pass schema from get_schema as schema_context."""
        schema_context = schema_context or "Schema not provided."
        try:
            prompt = FIX_SQL_PROMPT.format(
                db_type=db_type,
                metadata=schema_context,
                previous_sql=sql_query,
                error_message=error_message,
                format_instructions=generate_parser.get_format_instructions(),
            )
            result = llm.invoke(prompt)
            parsed = generate_parser.parse(result.content)
            fixed = parsed.get("query", "")
            return json.dumps({
                "fixed_sql_query": fixed,
                "original_error": error_message,
                "status": "success",
            })
        except Exception as e:
            return json.dumps({
                "fixed_sql_query": None,
                "original_error": error_message,
                "status": "error",
                "error": str(e),
            })

    return [generate_sql, evaluate_query, fix_sql]
