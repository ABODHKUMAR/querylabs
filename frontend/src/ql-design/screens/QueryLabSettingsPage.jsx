import { NavRail } from '../shell/NavRail';
import SettingsPage from '../../components/Settings';

export function QueryLabSettingsPage() {
  return (
    <div
      className="ql-root"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        background: 'var(--paper)',
      }}
    >
      <NavRail active="settings" />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
        <SettingsPage />
      </div>
    </div>
  );
}
