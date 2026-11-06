import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import "@ionic/react/css/core.css";
import AgentWorkspace from './components/AgentWorkspace';
import Layout from './components/Layout';
import DecisionCanvas from './components/DecisionCanvas';
import QueryLabApp from './ql-design/QueryLabApp';
import { QueryLabHistoryPage } from './ql-design/screens/QueryLabHistoryPage';
import { QueryLabObservabilityPage } from './ql-design/screens/QueryLabObservabilityPage';
import { QueryLabSettingsPage } from './ql-design/screens/QueryLabSettingsPage';

const ObservabilityPage = lazy(() => import('./components/ObservabilityPage'));

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/querylab" element={<QueryLabApp />} />
      <Route path="/querylab/history" element={<QueryLabHistoryPage />} />
      <Route path="/querylab/observability" element={<QueryLabObservabilityPage />} />
      <Route path="/settings" element={<QueryLabSettingsPage />} />
      <Route path="/querylab/settings" element={<QueryLabSettingsPage />} />

      <Route element={<Layout />}>
        <Route
          path="/agent-studio"
          element={<AgentWorkspace />}
        />
        <Route
          path="/observability"
          element={
            <Suspense fallback={null}>
              <ObservabilityPage />
            </Suspense>
          }
        />
        <Route path="/canvas" element={<DecisionCanvas />} />
      </Route>
    </Routes>
  );
}

export default App;
