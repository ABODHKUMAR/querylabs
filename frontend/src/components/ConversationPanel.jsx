import React from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import './ConversationPanel.css';

const STATUS_CONFIG = {
  loading:          { label: 'Proposing plan',        dot: 'dot-amber',  icon: 'spin' },
  pending_approval: { label: 'Plan ready',             dot: 'dot-amber',  icon: null  },
  executing:        { label: 'Running approved plan',  dot: 'dot-blue',   icon: 'spin' },
  replying:         { label: 'Replying',               dot: 'dot-blue',   icon: 'spin' },
  error:            { label: 'Plan error',             dot: 'dot-red',    icon: null  },
  live:             { label: 'Live',                   dot: 'dot-green',  icon: null  },
};

const ConversationPanel = ({
  chatHistory = [],
  sessionMeta = {},
  planPhase = 'idle',
  isStreaming = false,
  onRegenerate,
}) => {
  const { title, turnCount, startTime } = sessionMeta;

  const recentMessages = chatHistory.slice(-3);

  const formatTime = (ts) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  // Derive status key
  const statusKey = (() => {
    if (planPhase === 'loading')          return 'loading';
    if (planPhase === 'pending_approval') return 'pending_approval';
    if (planPhase === 'executing')        return 'executing';
    if (planPhase === 'error')            return 'error';
    if (isStreaming)                      return 'replying';
    return 'live';
  })();

  const { label: statusLabel, dot: dotCls, icon: iconType } = STATUS_CONFIG[statusKey];

  return (
    <div className="conv-panel">
      <p className="conv-header-label">CONVERSATION</p>

      {(chatHistory.length > 0 || title) && (
        <div className="conv-card">
          <p className="conv-card-title">{title || 'New conversation'}</p>

          {/* Dynamic status row */}
          <div className="conv-status-row">
            {iconType === 'spin'
              ? <Loader2 size={10} className={`conv-status-spinner ${dotCls}-text`} />
              : <span className={`conv-live-dot ${dotCls}`} />
            }
            <span className={`conv-status-badge ${dotCls}-text`}>{statusLabel}</span>
            <span className="conv-sep">·</span>
            <span className="conv-status-text">{turnCount ?? chatHistory.length} turn{(turnCount ?? chatHistory.length) !== 1 ? 's' : ''}</span>
            {startTime && (
              <>
                <span className="conv-sep">·</span>
                <span className="conv-status-text">started {startTime}</span>
              </>
            )}
          </div>

          {/* Message snippets */}
          {recentMessages.length > 0 && (
            <div className="conv-snippets">
              {recentMessages.map((msg, i) => (
                <React.Fragment key={i}>
                  {msg.query && (
                    <div className="conv-snippet-row">
                      <span className="conv-avatar conv-avatar-user">U</span>
                      <span className="conv-snippet-text">{msg.query}</span>
                    </div>
                  )}
                  {msg.response && (
                    <div className="conv-snippet-row">
                      <span className="conv-avatar conv-avatar-querylab">N</span>
                      <span className="conv-snippet-text">{msg.response}</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {chatHistory.length > 0 && onRegenerate && (
            <div className="conv-actions">
              <button className="conv-action-btn" onClick={onRegenerate} title="Re-propose plan">
                <RotateCcw size={12} strokeWidth={2} />
                Re-propose
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {chatHistory.length === 0 && !title && (
        <div className="conv-empty">
          <p className="conv-empty-text">Start a conversation to see it here.</p>
        </div>
      )}
    </div>
  );
};

export default ConversationPanel;
