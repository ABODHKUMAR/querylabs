const STARTER_QUESTIONS = {
  sql_agent: [
    "What are the top 10 customers by revenue this month?",
    "Show me sales trends for the last 6 months",
    "Which products have the highest profit margin?",
    "Compare performance across all regions",
  ],
  avani_lifestyle: [
    "What are the top selling products?",
    "Show revenue breakdown by category",
    "Which stores have the highest footfall?",
    "Show monthly sales trends for this year",
  ],
  forge_global: [
    "Show total AUM by fund",
    "Which portfolio companies have the highest IRR?",
    "Show deal pipeline by stage",
    "Compare fund performance year over year",
  ],
  vector_agent: [
    "What documents are available?",
    "Summarize the key findings",
    "What are the main topics covered?",
    "Find relevant sections about performance",
  ],
  financial_metrics: [
    "Show me the P&L summary for this quarter",
    "What is the current burn rate?",
    "Compare revenue vs expenses month over month",
    "Which cost centres have the highest variance?",
  ],
  novadash: [
    "Show campaign performance overview",
    "Which channels have the best conversion rate?",
    "Show ROAS by campaign",
    "Compare spend vs revenue this month",
  ],
};

function toDisplayName(agentName) {
  if (!agentName) return 'Query Labs';
  return agentName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const EmptyState = ({ agentName, onSubmit }) => {
  const questions = STARTER_QUESTIONS[agentName] ?? [];
  const displayName = toDisplayName(agentName);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10">
      <h2 className="text-xl font-semibold text-text-primary mb-1">{displayName}</h2>
      <p className="text-sm text-text-secondary mb-8">Ask a question to get started</p>

      {questions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
          {questions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSubmit(q)}
              className="text-left px-4 py-3 bg-white dark:bg-dark-surface border border-separator dark:border-gray-700 rounded-lg text-sm text-text-primary dark:text-gray-200 hover:border-brand-blue dark:hover:border-brand-blue transition-colors cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
