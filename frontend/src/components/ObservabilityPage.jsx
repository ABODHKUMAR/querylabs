import { useState } from 'react';
import AgentHealthDashboard from './observability/AgentHealthDashboard';
import AuditTrailTable from './observability/AuditTrailTable';

const TABS = [
  { id: 'health', label: 'Agent Health' },
  { id: 'audit', label: 'Audit Trail' },
];

const ObservabilityPage = () => {
  const [activeTab, setActiveTab] = useState('health');
  const [filterAgent, setFilterAgent] = useState(null);

  const handleAgentSelect = (agentName) => {
    setFilterAgent(agentName);
    setActiveTab('audit');
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="border-b border-separator dark:border-gray-800 bg-white dark:bg-dark-surface px-6 shrink-0">
        <div className="flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        {activeTab === 'health' && (
          <div className="flex-1 overflow-auto">
            <AgentHealthDashboard onAgentSelect={handleAgentSelect} />
          </div>
        )}
        {activeTab === 'audit' && (
          <AuditTrailTable initialAgent={filterAgent} />
        )}
      </div>
    </div>
  );
};

export default ObservabilityPage;
