import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { NavRail } from '../shell/NavRail';
import { I } from '../icons';
import { QueryLabLogo } from '../QueryLabLogo';
import { fetchAllHistory } from '../../api/api';

function timeGroup(dttm) {
  if (!dttm) return 'Older';
  const d   = new Date(dttm);
  const now = new Date();
  const diff = (now - d) / 86400000;  // days
  if (diff < 1)   return 'Today';
  if (diff < 2)   return 'Yesterday';
  if (diff < 8)   return 'Last 7 days';
  if (diff < 31)  return 'Last 30 days';
  return 'Older';
}

function fmtTime(dttm) {
  if (!dttm) return '';
  const d = new Date(dttm);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dttm) {
  if (!dttm) return '';
  const d = new Date(dttm);
  if (isNaN(d)) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Older'];

function SkeletonRow() {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--paper-2)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ height: 13, width: '55%', background: 'var(--paper-2)', borderRadius: 4 }} />
        <div style={{ height: 10, width: '30%', background: 'var(--line)', borderRadius: 4 }} />
      </div>
    </div>
  );
}

function HistoryItem({ item, onClick }) {
  const [hov, setHov] = useState(false);
  const title = item.title || 'Untitled conversation';
  const agent = item.agent_name || '';
  const dateStr = item.dttm ? `${fmtDate(item.dttm)} · ${fmtTime(item.dttm)}` : '';

  return (
    <div
      onClick={() => onClick(item)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12,
        borderBottom: '1px solid var(--line-soft)',
        background: hov ? 'var(--surface-tint)' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8, background: 'var(--brand-soft)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-2)',
      }}>
        <I.sparkle size={12} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 500, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3,
        }}>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dateStr && <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{dateStr}</span>}
          {agent && (
            <>
              <span style={{ fontSize: 11, color: 'var(--ink-5)' }}>·</span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--brand-2)',
                background: 'var(--brand-soft)', padding: '1px 6px', borderRadius: 4,
              }}>
                {agent}
              </span>
            </>
          )}
          {item.is_pinned && (
            <>
              <span style={{ fontSize: 11, color: 'var(--ink-5)' }}>·</span>
              <I.pin size={11} />
            </>
          )}
        </div>
      </div>
      {hov && (
        <button
          onClick={e => e.stopPropagation()}
          className="icn"
          style={{ width: 26, height: 26, flexShrink: 0, opacity: 0.6 }}
        >
          <I.more />
        </button>
      )}
    </div>
  );
}

export function QueryLabHistoryPage() {
  const navigate = useNavigate();
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,  setSearch]  = useState('');

  const userId    = useRef(localStorage.getItem('ql_userID') || 'anonymous');
  const sessionId = useRef(localStorage.getItem('sessionId') || '');

  // Auth guard — redirect to login if no token
  useEffect(() => {
    if (!Cookies.get('authToken')) navigate('/');
  }, [navigate]);

  useEffect(() => {
    // 1. Show cached data instantly (stale-while-revalidate)
    try {
      const cached = JSON.parse(localStorage.getItem('allHistoryTitle') || '[]');
      if (cached.length > 0) { setItems(cached); setLoading(false); }
    } catch { /* ignore parse errors */ }

    // 2. Refresh from API in background
    const timeout = setTimeout(() => setLoading(false), 5000);
    fetchAllHistory(userId.current, sessionId.current)
      .then(data => {
        const raw = Array.isArray(data) ? data
          : Array.isArray(data?.items) ? data.items
          : Object.values(data || {}).filter(v => v && typeof v === 'object');
        const fresh = raw.filter(Boolean);
        if (fresh.length > 0) {
          try { localStorage.setItem('allHistoryTitle', JSON.stringify(fresh)); } catch { /* ignore */ }
          setItems(fresh);
        }
      })
      .catch(() => { /* silent — showing cached data */ })
      .finally(() => { clearTimeout(timeout); setLoading(false); });

    return () => clearTimeout(timeout);
  }, []);

  const filtered = search.trim()
    ? items.filter(it => (it.title || '').toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  // Group by time period
  const grouped = {};
  filtered.forEach(item => {
    const g = timeGroup(item.dttm);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(item);
  });

  const handleClick = (item) => {
    navigate('/querylab', { state: { histId: item.hist_id || item.id, title: item.title } });
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'var(--paper)' }}>
      <NavRail active="history" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          padding: '16px 28px', borderBottom: '1px solid var(--line)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--paper)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <QueryLabLogo size={22} />
            <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
            <div className="label">Conversation history</div>
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', display: 'inline-flex' }}>
              <I.search size={14} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              style={{
                paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)',
                fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--ink)', outline: 'none',
                width: 240,
              }}
            />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && (
            <div style={{ padding: '0' }}>
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          )}

          {error && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--neg)' }}>
              <div className="h-card" style={{ marginBottom: 8 }}>Failed to load history</div>
              <div className="body-sm" style={{ color: 'var(--ink-3)' }}>{error}</div>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div className="h-card" style={{ marginBottom: 8, color: 'var(--ink-3)' }}>
                {search ? 'No conversations match your search' : 'No conversation history yet'}
              </div>
              <div className="body-sm" style={{ color: 'var(--ink-4)', marginBottom: 20 }}>
                {search ? 'Try a different search term' : 'Start by asking a question on the Ask page'}
              </div>
              {!search && (
                <button
                  className="btn primary"
                  onClick={() => navigate('/querylab')}
                  style={{ padding: '9px 20px' }}
                >
                  <I.sparkle /> New conversation
                </button>
              )}
            </div>
          )}

          {!loading && !error && GROUP_ORDER.filter(g => grouped[g]?.length > 0).map(group => (
            <div key={group}>
              <div style={{
                padding: '10px 16px 6px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em',
                textTransform: 'uppercase', color: 'var(--ink-4)', background: 'var(--surface-tint)',
                borderBottom: '1px solid var(--line-soft)',
              }}>
                {group}
              </div>
              {grouped[group].map(item => (
                <HistoryItem key={item.hist_id} item={item} onClick={handleClick} />
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        {!loading && !error && items.length > 0 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--line)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface)',
          }}>
            <span className="label" style={{ color: 'var(--ink-3)' }}>
              {items.length} conversation{items.length !== 1 ? 's' : ''} total
            </span>
            <button className="btn sm" onClick={() => navigate('/querylab')}>
              <I.plus /> New conversation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
