import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SquarePen, MessageSquare, Clock, BarChart2 } from 'lucide-react';
import UserMenu from './UserMenu';
import { clearAuthSession } from './hooks/helpers';
import { logout } from '../api/api';

const SideIconNav = ({ activeLeftView, onChangeView, onNewChat }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  const getUserInitials = () => {
    try {
      const name = localStorage.getItem('ql_userName') || localStorage.getItem('userName') || '';
      if (name) return name.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
      const email = localStorage.getItem('ql_userEmail') || localStorage.getItem('userEmail') || '';
      if (email) {
        const parts = email.split('@')[0].split('.');
        return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 2);
      }
    } catch (_) {}
    return 'U';
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowMenu(false);
    try {
      await logout();
    } finally {
      clearAuthSession();
      navigate('/', { replace: true });
    }
  };

  const isObservability = location.pathname.toLowerCase() === '/observability';

  return (
    <div className="querylab-icon-strip">
      {/* Logo */}
      <img
        src="/ql-logo.svg"
        alt="Query Labs"
        className="strip-logo"
        onClick={() => navigate('/chatBox')}
        title="Query Labs"
      />

      {/* New Chat */}
      <button
        className="strip-btn"
        onClick={onNewChat}
        title="New chat"
      >
        <SquarePen size={17} strokeWidth={2} />
      </button>

      {/* Chat / Conversation view */}
      <button
        className={`strip-btn ${activeLeftView === 'conversation' ? 'active' : ''}`}
        onClick={() => { onChangeView('conversation'); navigate('/chatBox'); }}
        title="Chat"
      >
        <MessageSquare size={17} strokeWidth={2} />
      </button>

      {/* History */}
      <button
        className={`strip-btn ${activeLeftView === 'history' ? 'active' : ''}`}
        onClick={() => onChangeView(activeLeftView === 'history' ? 'conversation' : 'history')}
        title="History"
      >
        <Clock size={17} strokeWidth={2} />
      </button>

      {/* Observability */}
      <button
        className={`strip-btn ${isObservability ? 'active' : ''}`}
        onClick={() => navigate('/observability')}
        title="Observability"
      >
        <BarChart2 size={17} strokeWidth={2} />
      </button>

      <div className="strip-spacer" />

      {/* User avatar */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          className="strip-avatar"
          onClick={() => setShowMenu(prev => !prev)}
          title="User menu"
        >
          {getUserInitials()}
        </button>
        {showMenu && (
          <div style={{ position: 'absolute', bottom: '36px', left: '36px', zIndex: 50 }}>
            <UserMenu onLogout={handleLogout} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SideIconNav;
