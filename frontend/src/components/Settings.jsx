import { useEffect, useState } from "react";
import { Plus, ToggleLeft, ToggleRight } from "lucide-react";
import CreateConnection from "./CreateConnection";
import { GetCredentials, datasourceToggleApi } from "../api/api";
import VirtualizedTable from "../tables/VirtualizedTable";
import { I } from "../ql-design/icons";
import "../ql-design/tokens.css";

const TABS = [
  { key: "Database_Connections", label: "Resources", icon: I.database },
  { key: "LLM_Model_Connections", label: "Models", icon: I.chip },
  { key: "Token_Usage", label: "Token Usage", icon: I.chart },
];

const SettingsPage = () => {
  const [credentials, setCredentials] = useState({
    Database_Connections: [],
    LLM_Model_Connections: [],
    Token_Usage: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState(TABS[0].key);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await GetCredentials();
      setCredentials(result);
    } catch (err) {
      console.error("Failed to fetch connections:", err);
      setError("Could not load settings. Check that the orchestrator is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleOpenModal = (item) => {
    if (selectedTab === "Database_Connections") {
      setEditItem({
        ...item,
        CONN_ID: item?.CONN_ID ?? item?.metadata_config?.id ?? item?.id,
      });
      setIsModalOpen(true);
    }
  };

  const handleAddNew = () => {
    if (selectedTab === "Database_Connections") {
      setEditItem(null);
      setIsModalOpen(true);
    }
  };

  const handleToggleClick = async (item) => {
    const id = item.metadata_config?.id;
    if (id == null) return;
    setTogglingId(id);
    try {
      await datasourceToggleApi(id, !item.metadata_config.is_active);
      setCredentials((prev) => {
        const updatedList = prev.Database_Connections.map((row) =>
          row.metadata_config?.id === id
            ? {
                ...row,
                metadata_config: {
                  ...row.metadata_config,
                  is_active: !row.metadata_config.is_active,
                },
                is_active: row.metadata_config.is_active ? 0 : 1,
              }
            : row
        );
        return { ...prev, Database_Connections: updatedList };
      });
    } catch (err) {
      console.error("Toggle failed", err);
    } finally {
      setTogglingId(null);
    }
  };

  const activeTab = TABS.find((t) => t.key === selectedTab) || TABS[0];
  const rows = credentials[selectedTab] || [];

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, height: "100%", background: "var(--paper)" }}>
      {/* Settings sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          background: "var(--surface)",
          padding: "24px 14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, padding: "0 8px" }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "var(--brand-soft)",
              color: "var(--brand-2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <I.settings size={16} />
          </span>
          <div>
            <div className="h-card" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>
              Settings
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>Query Labs</div>
          </div>
        </div>

        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSelectedTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: isActive ? "var(--brand-soft)" : "transparent",
                color: isActive ? "var(--brand-2)" : "var(--ink-3)",
                fontWeight: isActive ? 600 : 500,
                fontSize: 13,
                transition: "all .12s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--surface-tint)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </aside>

      {/* Main */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: "auto",
          padding: "28px 32px 40px",
          background: "var(--surface-tint, #f7f6f4)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", textAlign: "left" }}>
                {activeTab.label}
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-4)", textAlign: "left" }}>
                {selectedTab === "Database_Connections" && "SQL and vector data sources wired to Query Labs agents."}
                {selectedTab === "LLM_Model_Connections" && "Models used for chat, planning, and embeddings."}
                {selectedTab === "Token_Usage" && "Estimated daily token usage for this workspace."}
              </p>
            </div>
            {selectedTab === "Database_Connections" && !loading && (
              <button
                type="button"
                onClick={handleAddNew}
                title="Add connection"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--brand)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 560,
                  cursor: "pointer",
                  boxShadow: "var(--sh-1)",
                  flexShrink: 0,
                }}
              >
                <Plus size={16} />
                Add
              </button>
            )}
          </div>

          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, gap: 14 }}>
              <span className="thinking-orb" />
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading {activeTab.label.toLowerCase()}…</span>
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: 18,
                borderRadius: 12,
                border: "1px solid var(--neg-soft)",
                background: "var(--neg-soft)",
                color: "var(--neg)",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              {error}
              <button
                type="button"
                onClick={fetchCredentials}
                style={{
                  marginLeft: 12,
                  border: "1px solid var(--neg)",
                  background: "transparent",
                  color: "var(--neg)",
                  borderRadius: 8,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && selectedTab === "Token_Usage" && (
            rows.length === 0 ? (
              <EmptyState label="No token usage recorded yet." />
            ) : (
              <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", background: "var(--surface)" }}>
                <VirtualizedTable data={rows} />
              </div>
            )
          )}

          {!loading && !error && selectedTab !== "Token_Usage" && (
            rows.length === 0 ? (
              <EmptyState label={`No ${activeTab.label.toLowerCase()} configured yet.`} />
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  alignItems: "stretch",
                }}
              >
                {rows.map((item, index) => (
                  <ResourceCard
                    key={item.id || item.metadata_config?.id || index}
                    item={item}
                    tab={selectedTab}
                    togglingId={togglingId}
                    onOpen={() => handleOpenModal(item)}
                    onToggle={() => handleToggleClick(item)}
                  />
                ))}
              </div>
            )
          )}
        </div>

        {selectedTab === "Database_Connections" && (
          <CreateConnection
            openModel={isModalOpen}
            setOpenModel={setIsModalOpen}
            database_details={editItem || {}}
            title={editItem ? "Update connection" : "Add connection"}
            type={selectedTab}
            onSaved={fetchCredentials}
          />
        )}
      </main>
    </div>
  );
};

function EmptyState({ label }) {
  return (
    <div
      style={{
        minHeight: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px dashed var(--line-strong)",
        borderRadius: 14,
        background: "var(--surface-tint)",
        color: "var(--ink-4)",
        fontSize: 13,
      }}
    >
      {label}
    </div>
  );
}

/** Friendly labels so internal/client DB names are not shown in Settings. */
const DB_LABELS = {
  financial_metrics: "finance_metrics",
  beat_results_dev: "qa_results",
  meridian_ventures: "portfolio_db",
  novadash: "growth_db",
  avani: "retail_db",
  mvw: "hospitality_db",
  pe_trading_db: "markets_db",
  "querylab collections": "querylab collections",
  neondb: "neondb",
};

function friendlyHost(host) {
  if (!host || host === "N/A") return "N/A";
  if (host === "mysql" || host === "weaviate") return host;
  // Truncate long cloud hosts without dumping the full endpoint
  if (String(host).includes("neon.tech") || String(host).includes("pooler")) return "neon pooler";
  return String(host).length > 28 ? `${String(host).slice(0, 26)}…` : host;
}

function ResourceCard({ item, tab, togglingId, onOpen, onToggle }) {
  const isDb = tab === "Database_Connections";
  const active = isDb ? !!item.metadata_config?.is_active : item.is_active === 1;
  const title = isDb
    ? item?.metadata_config?.sementic_name || "Resource"
    : item.model_type || item.model || "Model";
  const rawDb = item.config?.DATABASE;
  const dbLabel = rawDb ? (DB_LABELS[rawDb] || rawDb) : null;

  return (
    <div
      role={isDb ? "button" : undefined}
      tabIndex={isDb ? 0 : undefined}
      onClick={isDb ? onOpen : undefined}
      onKeyDown={isDb ? (e) => e.key === "Enter" && onOpen() : undefined}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: "16px 16px 14px 18px",
        boxShadow: "var(--sh-1)",
        cursor: isDb ? "pointer" : "default",
        overflow: "hidden",
        transition: "box-shadow .12s, border-color .12s",
        textAlign: "left",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "var(--sh-2)";
        e.currentTarget.style.borderColor = "var(--line-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "var(--sh-1)";
        e.currentTarget.style.borderColor = "var(--line)";
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: active ? "var(--pos)" : "var(--warn)",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
            lineHeight: 1.35,
            wordBreak: "break-word",
            textAlign: "left",
          }}
        >
          {title}
        </div>
        {isDb && (
          <button
            type="button"
            title={active ? "Deactivate" : "Activate"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={togglingId === item.metadata_config?.id}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
              opacity: togglingId === item.metadata_config?.id ? 0.5 : 1,
              color: active ? "var(--pos)" : "var(--warn)",
              flexShrink: 0,
            }}
          >
            {active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
          </button>
        )}
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--ink-3)", flex: 1 }}>
        {isDb ? (
          <>
            <MetaRow label="Type" value={item.DB_TYPE} />
            <MetaRow label="Host" value={friendlyHost(item.config?.SERVER_HOSTNAME || item.config?.HOST || "N/A")} />
            {dbLabel && <MetaRow label="Database" value={dbLabel} />}
            <MetaRow label="Last sync" value={item.updated_at || "N/A"} />
          </>
        ) : (
          <>
            <MetaRow label="Model" value={item.model || item.config?.model_name} />
            <MetaRow label="Provider" value={item.provider || item.config?.provider} />
            <MetaRow label="API key" value="••••••••••••" />
          </>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
      <span style={{ color: "var(--ink-4)", flexShrink: 0 }}>{label}:</span>
      <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(value ?? "")}>
        {value ?? "N/A"}
      </span>
    </div>
  );
}

export default SettingsPage;
