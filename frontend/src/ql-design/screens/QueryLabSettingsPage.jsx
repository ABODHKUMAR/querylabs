import { NavRail } from '../shell/NavRail';
import SettingsPage from '../../components/Settings';

export function QueryLabSettingsPage() {
  return (
    <div className="ql-root" style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail active="settings" />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <SettingsPage />
      </div>
    </div>
  );
}
