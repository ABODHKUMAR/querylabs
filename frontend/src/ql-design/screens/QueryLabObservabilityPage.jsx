import { lazy, Suspense } from 'react';
import { NavRail } from '../shell/NavRail';

const ObservabilityPage = lazy(() => import('../../components/ObservabilityPage'));

export function QueryLabObservabilityPage() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail active="observability" />
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Suspense fallback={
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span className="thinking-orb" />
          </div>
        }>
          <ObservabilityPage />
        </Suspense>
      </div>
    </div>
  );
}
