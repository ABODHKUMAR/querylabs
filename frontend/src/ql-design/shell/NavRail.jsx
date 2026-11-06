import { useContext, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QueryLabLogo, Avatar, getInitials } from '../QueryLabLogo';
import { NavContext } from '../NavContext';
import { I } from '../icons';
import { logout } from '../../api/api';
import { clearAuthSession } from '../../components/hooks/helpers';

const NAV_ITEMS = [
  { key: 'ask',           icon: <I.plus />,     label: 'Ask',          route: '/querylab' },
  { key: 'history',       icon: <I.history />,  label: 'History',      route: '/querylab/history' },
  { key: 'sources',       icon: <I.database />, label: 'Sources',      route: null },
  { key: 'library',       icon: <I.doc />,      label: 'Library',      route: null },
  { key: 'observability', icon: <I.bolt />,     label: 'Observability',route: '/querylab/observability' },
];

function activeFromPath(pathname) {
  if (pathname.startsWith('/settings') || pathname.startsWith('/querylab/settings')) return 'settings';
  if (pathname.startsWith('/querylab/history') || pathname.startsWith('/querylab/history'))       return 'history';
  if (pathname.startsWith('/querylab/observability') || pathname.startsWith('/querylab/observability')) return 'observability';
  if (pathname.startsWith('/querylab/sources') || pathname.startsWith('/querylab/sources'))       return 'sources';
  if (pathname.startsWith('/querylab/library') || pathname.startsWith('/querylab/library'))       return 'library';
  return 'ask';
}

export function NavRail({ active: activeProp }) {
  const navigate   = useNavigate();
  const { pathname } = useLocation();
  const ctx        = useContext(NavContext);
  const [loggingOut, setLoggingOut] = useState(false);

  const active = activeProp ?? (ctx.leftView === 'history' ? 'history' : activeFromPath(pathname));

  const handleClick = (item) => {
    if (item.key === 'history') {
      if (ctx.onToggleHistory) { ctx.onToggleHistory(); return; }
    }
    if (!item.route) return;
    if (item.key === 'ask') ctx.onAsk?.();
    navigate(item.route);
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      clearAuthSession();
      navigate('/', { replace: true });
      setLoggingOut(false);
    }
  };

  return (
    <nav style={{
      width: 56,
      borderRight: '1px solid var(--line)',
      background: 'var(--paper)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '14px 0',
      gap: 6,
      flexShrink: 0,
    }}>
      <div style={{ padding: '4px 0 14px' }}>
        <QueryLabLogo size={26} />
      </div>

      {NAV_ITEMS.map(item => {
        const isActive = item.key === active;
        const disabled = !item.route;
        return (
          <button
            key={item.key}
            title={item.label}
            onClick={() => handleClick(item)}
            style={{
              width: 38, height: 38,
              borderRadius: 10,
              border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              background: isActive ? 'var(--brand-soft)' : 'transparent',
              color: isActive ? 'var(--brand-2)' : disabled ? 'var(--ink-5)' : 'var(--ink-3)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .12s',
              opacity: disabled ? 0.45 : 1,
            }}
            onMouseEnter={e => { if (!disabled && !isActive) e.currentTarget.style.background = 'var(--surface-tint)'; }}
            onMouseLeave={e => { if (!disabled && !isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            {item.icon}
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      <button
        className="icn"
        title="Settings"
        onClick={() => navigate('/settings')}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          border: 'none',
          cursor: 'pointer',
          background: active === 'settings' ? 'var(--brand-soft)' : 'transparent',
          color: active === 'settings' ? 'var(--brand-2)' : 'var(--ink-3)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <I.settings size={17} />
      </button>
      <button
        className="icn"
        title={loggingOut ? 'Signing out…' : 'Logout'}
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="Logout"
        style={{ opacity: loggingOut ? 0.5 : 1 }}
      >
        <I.logout />
      </button>
      <Avatar initials={getInitials()} tone="ink" />
    </nav>
  );
}
