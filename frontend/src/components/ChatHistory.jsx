import React, { forwardRef, useState, useMemo } from "react";
import { MessageSquare, ChevronDown, ChevronRight, Clock, X, History, Search, Pin } from "lucide-react";
import LoadingSpinner from "./LoadingSpinner";
import './ChatHistory.css';

const ChatHistory = forwardRef(
  ({ isVisible, setIsVisible, allChatHistory, isLoading, handleLoadChat, handleNewChat, onPinToggle, availableAgents }, ref) => {
    const [expandedSections, setExpandedSections] = useState({
      pinned: true,
      today: true,
      yesterday: false,
      lastWeek: false,
      lastMonth: false,
      older: false,
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [agentFilter, setAgentFilter] = useState("all");
    const [hoveredItem, setHoveredItem] = useState(null);

    const toggleSection = (section) => {
      setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    const formatTimestamp = (timestamp) => {
      if (!timestamp) return "";
      try {
        const date = new Date(timestamp);
        return (
          date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) +
          " " +
          date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      } catch {
        return "";
      }
    };

    // Build agent filter list from all configured agents
    const uniqueAgents = useMemo(() => {
      const agents = new Set();
      availableAgents?.forEach(a => agents.add(typeof a === 'object' ? a.name : a));
      return Array.from(agents).sort();
    }, [availableAgents]);

    const { pinnedItems, groupedItems } = useMemo(() => {
      if (!allChatHistory || allChatHistory.length === 0) return { pinnedItems: [], groupedItems: {} };

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date(today);
      lastMonth.setDate(lastMonth.getDate() - 30);

      // Apply search + agent filters
      const filtered = allChatHistory.filter(item => {
        const matchesSearch = !searchQuery.trim() ||
          item.title?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesAgent = agentFilter === "all" || item.agent_name === agentFilter;
        return matchesSearch && matchesAgent;
      });

      const pinned = filtered.filter(item => item.is_pinned);

      const groups = { today: [], yesterday: [], lastWeek: [], lastMonth: [], older: [] };
      filtered.filter(item => !item.is_pinned).forEach((item) => {
        const itemDate = new Date(item.dttm);
        const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

        if (itemDay.getTime() === today.getTime()) {
          groups.today.push(item);
        } else if (itemDay.getTime() === yesterday.getTime()) {
          groups.yesterday.push(item);
        } else if (itemDate >= lastWeek) {
          groups.lastWeek.push(item);
        } else if (itemDate >= lastMonth) {
          groups.lastMonth.push(item);
        } else {
          groups.older.push(item);
        }
      });

      return { pinnedItems: pinned, groupedItems: groups };
    }, [allChatHistory, searchQuery, agentFilter]);

    const renderItem = (item) => (
      <li
        key={item.hist_id}
        className="history-item"
        onClick={() => handleLoadChat(item.hist_id)}
        onMouseEnter={() => setHoveredItem(item.hist_id)}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <div className="history-item-row">
          <div className="history-item-title">{item.title}</div>
          {onPinToggle && (
            <button
              className={`history-pin-btn ${item.is_pinned ? "pinned" : ""} ${hoveredItem === item.hist_id ? "visible" : ""}`}
              onClick={(e) => { e.stopPropagation(); onPinToggle(item.hist_id); }}
              title={item.is_pinned ? "Unpin conversation" : "Pin conversation"}
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
        </div>
        {item.dttm && (
          <div className="history-item-time">
            <Clock className="history-item-time-icon" />
            {new Date(item.dttm).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </li>
    );

    const hasAnyItems =
      pinnedItems.length > 0 ||
      Object.values(groupedItems).some(arr => arr.length > 0);

    return (
      <div ref={ref} className="chat-history-container">
        {isLoading && <LoadingOverlay />}

        {/* Header */}
        <div className="chat-history-header">
          <div className="chat-history-header-content">
            <div className="chat-history-header-left">
              <History className="chat-history-header-icon" />
              <span className="chat-history-header-title">History</span>
            </div>
            <button
              className="chat-history-close-btn"
              onClick={() => setIsVisible(false)}
              aria-label="Close history panel"
            >
              <X className="chat-history-close-icon" />
            </button>
          </div>

          {/* Search */}
          <div className="chat-history-search">
            <Search className="chat-history-search-icon" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="chat-history-search-input"
            />
            {searchQuery && (
              <button className="chat-history-search-clear" onClick={() => setSearchQuery("")}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Agent filter — only shown when there are multiple agents */}
          {uniqueAgents.length > 1 && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="history-agent-filter"
            >
              <option value="all">All Agents</option>
              {uniqueAgents.map(a => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="chat-history-content">
          {hasAnyItems ? (
            <div className="space-y-2">
              {/* Pinned Section */}
              {pinnedItems.length > 0 && (
                <div className="history-section">
                  <button
                    onClick={() => toggleSection("pinned")}
                    className="history-section-button"
                  >
                    <span className="history-section-label">
                      <Pin className="history-section-icon pinned" />
                      Pinned
                    </span>
                    {expandedSections.pinned
                      ? <ChevronDown className="history-section-chevron" />
                      : <ChevronRight className="history-section-chevron" />}
                  </button>
                  {expandedSections.pinned && (
                    <ul className="history-items-list">{pinnedItems.map(renderItem)}</ul>
                  )}
                </div>
              )}

              {/* Today */}
              {groupedItems.today?.length > 0 && (
                <div className="history-section">
                  <button onClick={() => toggleSection("today")} className="history-section-button">
                    <span className="history-section-label">
                      <Clock className="history-section-icon today" />
                      Today
                    </span>
                    {expandedSections.today
                      ? <ChevronDown className="history-section-chevron" />
                      : <ChevronRight className="history-section-chevron" />}
                  </button>
                  {expandedSections.today && (
                    <ul className="history-items-list">{groupedItems.today.map(renderItem)}</ul>
                  )}
                </div>
              )}

              {/* Yesterday */}
              {groupedItems.yesterday?.length > 0 && (
                <div className="history-section">
                  <button onClick={() => toggleSection("yesterday")} className="history-section-button">
                    <span className="history-section-label">
                      <Clock className="history-section-icon yesterday" />
                      Yesterday
                    </span>
                    {expandedSections.yesterday
                      ? <ChevronDown className="history-section-chevron" />
                      : <ChevronRight className="history-section-chevron" />}
                  </button>
                  {expandedSections.yesterday && (
                    <ul className="history-items-list">{groupedItems.yesterday.map(renderItem)}</ul>
                  )}
                </div>
              )}

              {/* Last 7 Days */}
              {groupedItems.lastWeek?.length > 0 && (
                <div className="history-section">
                  <button onClick={() => toggleSection("lastWeek")} className="history-section-button">
                    <span className="history-section-label">
                      <Clock className="history-section-icon last-week" />
                      Last 7 Days
                    </span>
                    {expandedSections.lastWeek
                      ? <ChevronDown className="history-section-chevron" />
                      : <ChevronRight className="history-section-chevron" />}
                  </button>
                  {expandedSections.lastWeek && (
                    <ul className="history-items-list">{groupedItems.lastWeek.map(renderItem)}</ul>
                  )}
                </div>
              )}

              {/* Last 30 Days */}
              {groupedItems.lastMonth?.length > 0 && (
                <div className="history-section">
                  <button onClick={() => toggleSection("lastMonth")} className="history-section-button">
                    <span className="history-section-label">
                      <Clock className="history-section-icon last-month" />
                      Last 30 Days
                    </span>
                    {expandedSections.lastMonth
                      ? <ChevronDown className="history-section-chevron" />
                      : <ChevronRight className="history-section-chevron" />}
                  </button>
                  {expandedSections.lastMonth && (
                    <ul className="history-items-list">{groupedItems.lastMonth.map(renderItem)}</ul>
                  )}
                </div>
              )}

              {/* Older */}
              {groupedItems.older?.length > 0 && (
                <div className="history-section">
                  <button onClick={() => toggleSection("older")} className="history-section-button">
                    <span className="history-section-label">
                      <Clock className="history-section-icon older" />
                      Older
                    </span>
                    {expandedSections.older
                      ? <ChevronDown className="history-section-chevron" />
                      : <ChevronRight className="history-section-chevron" />}
                  </button>
                  {expandedSections.older && (
                    <ul className="history-items-list">{groupedItems.older.map(renderItem)}</ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="history-empty-state">
              <div className="history-empty-icon-wrapper">
                <MessageSquare className="history-empty-icon" />
              </div>
              <p className="history-empty-text-primary">No chat history yet</p>
              <p className="history-empty-text-secondary">Start a conversation to see it here</p>
            </div>
          )}
        </div>
      </div>
    );
  }
);

const LoadingOverlay = () => (
  <div className="chat-history-loading-overlay">
    <LoadingSpinner />
  </div>
);

export default ChatHistory;
