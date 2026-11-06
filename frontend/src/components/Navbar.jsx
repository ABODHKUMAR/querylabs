import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SquarePen } from "lucide-react";
import UserMenu from "./UserMenu";
import { clearAuthSession } from "../components/hooks/helpers";
import { logout } from "../api/api";
import './Navbar.css';

const NavBar = ({ showHistory, handleSidebarClick, handleNewChat, setNewChat, setCurrentView, speakerEnable, setSpeakerEnable }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const getUserInitials = () => {
    try {
      const name = localStorage.getItem('ql_userName') || localStorage.getItem('userName') || '';
      if (name) {
        return name.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
      }
      const email = localStorage.getItem('ql_userEmail') || localStorage.getItem('userEmail') || '';
      if (email) {
        const parts = email.split('@')[0].split('.');
        return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 2);
      }
    } catch (_) {}
    return 'U';
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowMenu(false);
    try {
      await logout();
    } finally {
      clearAuthSession();
      navigate("/", { replace: true });
    }
  };

  const isActive = (path) => currentPath.toLowerCase() === path.toLowerCase();

  return (
    <header className="navbar-container">
      {/* Left: Logo + Wordmark */}
      <div className="navbar-left">
        <div className="navbar-brand" onClick={() => navigate("/chatBox")} role="button" tabIndex={0}>
          <img src="/ql-logo.svg" alt="Query Labs" className="navbar-logo-img" />
          <span className="navbar-wordmark">Query Labs</span>
        </div>
      </div>

      {/* Center: Tab Bar */}
      <nav className="navbar-tabs">
        <a
          className={`navbar-tab${isActive('/querylab') ? ' navbar-tab-active' : ''}`}
          href="/querylab"
          onClick={(e) => { e.preventDefault(); navigate("/querylab"); }}
        >
          Chat
        </a>
        <a
          className={`navbar-tab${isActive('/querylab/observability') || isActive('/observability') ? ' navbar-tab-active' : ''}`}
          href="/querylab/observability"
          onClick={(e) => { e.preventDefault(); navigate("/querylab/observability"); }}
        >
          Observability
        </a>
        <a
          className={`navbar-tab${isActive('/settings') ? ' navbar-tab-active' : ''}`}
          href="/settings"
          onClick={(e) => { e.preventDefault(); navigate("/settings"); }}
        >
          Settings
        </a>
      </nav>

      {/* Right: New Chat + Avatar */}
      <div className="navbar-right">
        {isActive('/chatbox') && handleNewChat && (
          <button
            className="navbar-new-chat-btn"
            onClick={handleNewChat}
            title="New chat"
            aria-label="New chat"
          >
            <SquarePen className="w-4 h-4" strokeWidth={2} />
            <span className="navbar-new-chat-label">New chat</span>
          </button>
        )}
        <div className="user-menu-wrapper" ref={menuRef}>
          <div
            className="user-avatar"
            onClick={() => setShowMenu(prev => !prev)}
            title="User Menu"
            role="button"
            tabIndex={0}
          >
            <span className="user-initials">{getUserInitials()}</span>
          </div>
          {showMenu && <UserMenu onLogout={handleLogout} />}
        </div>
      </div>
    </header>
  );
};

export default NavBar;
