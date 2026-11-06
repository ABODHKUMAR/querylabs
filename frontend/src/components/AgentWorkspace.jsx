import { useCallback, useEffect, useState } from "react";
import Header from "./Header";
import {
  workspaceListAgents,
  workspaceCreateAgent,
  workspaceDeleteAgent,
  workspaceAgentTree,
  workspaceCreateSkillDir,
  workspaceGetInstruction,
  workspacePutInstruction,
  workspaceDeleteInstruction,
  workspaceGetSkillFile,
  workspacePutSkillFile,
  workspaceCreateSkillFile,
  workspaceDeleteSkillFile,
  workspaceGenerate,
  workspaceListSkills,
  workspaceListMCPRegistry,
} from "../api/api";
import { Bot, FileCode, FolderPlus, Plus, Save, Sparkles, Trash2, BookOpen, Server, Check } from "lucide-react";

export default function AgentWorkspace() {
  const [agents, setAgents] = useState([]);
  const [rootPath, setRootPath] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [tree, setTree] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [instructionLoaded, setInstructionLoaded] = useState(false);

  const [selectedSkill, setSelectedSkill] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  const [newAgentName, setNewAgentName] = useState("");
  const [newSkillType, setNewSkillType] = useState("");
  const [newMdName, setNewMdName] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  // Active tab: "files" | "skills" | "mcp"
  const [activeTab, setActiveTab] = useState("files");

  // Skills library from /skills
  const [skillsLibrary, setSkillsLibrary] = useState([]);
  const [allowedSkills, setAllowedSkills] = useState([]);

  // MCP registry from /mcp/registry
  const [mcpRegistry, setMcpRegistry] = useState([]);
  const [allowedMcpServers, setAllowedMcpServers] = useState([]);

  /** LLM assistant modal: agent_md | skill_md */
  const [aiOpen, setAiOpen] = useState(false);
  const [aiKind, setAiKind] = useState("agent_md");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRefine, setAiRefine] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const showMsg = (type, text) => {
    setMsg({ type, text });
    if (text) setTimeout(() => setMsg({ type: "", text: "" }), 5000);
  };

  const refreshAgents = useCallback(async () => {
    try {
      const data = await workspaceListAgents();
      setAgents(data.agents || []);
      setRootPath(data.root || "");
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Failed to list agents");
    }
  }, []);

  // Fetch skills library and MCP registry on mount
  useEffect(() => {
    refreshAgents();
    workspaceListSkills()
      .then((d) => setSkillsLibrary(d.skills || []))
      .catch(() => setSkillsLibrary([]));
    workspaceListMCPRegistry()
      .then((d) => setMcpRegistry(d.servers || []))
      .catch(() => setMcpRegistry([]));
  }, [refreshAgents]);

  const loadAgentDetail = useCallback(async (name) => {
    if (!name) {
      setTree(null);
      setInstruction("");
      setInstructionLoaded(false);
      setSelectedSkill(null);
      setSelectedFile(null);
      setFileContent("");
      setAllowedSkills([]);
      setAllowedMcpServers([]);
      return;
    }
    setBusy(true);
    try {
      const [t, inst] = await Promise.all([
        workspaceAgentTree(name),
        workspaceGetInstruction(name),
      ]);
      setTree(t);
      const content = inst.content ?? "";
      setInstruction(content);
      setInstructionLoaded(true);
      setSelectedSkill(null);
      setSelectedFile(null);
      setFileContent("");

      // Parse allowed_skills and allowed_mcp_servers from YAML frontmatter
      const skillsMatch = content.match(/^allowed_skills:\s*\n((?:\s+-\s+.+\n?)*)/m);
      const mcpMatch = content.match(/^allowed_mcp_servers:\s*\n((?:\s+-\s+.+\n?)*)/m);
      const parseYamlList = (block) =>
        block ? block.match(/- (.+)/g)?.map((s) => s.replace("- ", "").trim()) || [] : [];
      setAllowedSkills(parseYamlList(skillsMatch?.[1]));
      setAllowedMcpServers(parseYamlList(mcpMatch?.[1]));
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Load failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadAgentDetail(selectedAgent);
  }, [selectedAgent, loadAgentDetail]);

  const openFile = async (skillType, filename) => {
    if (!selectedAgent) return;
    setBusy(true);
    try {
      const data = await workspaceGetSkillFile(selectedAgent, skillType, filename);
      setSelectedSkill(skillType);
      setSelectedFile(filename);
      setFileContent(data.content ?? "");
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Open file failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAgent = async () => {
    const n = newAgentName.trim();
    if (!n) return;
    setBusy(true);
    try {
      await workspaceCreateAgent(n);
      setNewAgentName("");
      await refreshAgents();
      setSelectedAgent(n);
      showMsg("ok", `Agent "${n}" created`);
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent) return;
    const ok = window.confirm(
      `Delete agent "${selectedAgent}" and all skills? This cannot be undone. Type is not verified in this dialog — backend checks confirm.`
    );
    if (!ok) return;
    const confirm = window.prompt(`Type the agent name to confirm: ${selectedAgent}`);
    if (confirm !== selectedAgent) {
      showMsg("err", "Name mismatch");
      return;
    }
    setBusy(true);
    try {
      await workspaceDeleteAgent(selectedAgent, confirm);
      setSelectedAgent(null);
      await refreshAgents();
      showMsg("ok", "Agent deleted");
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAddSkillDir = async () => {
    if (!selectedAgent || !newSkillType.trim()) return;
    setBusy(true);
    try {
      await workspaceCreateSkillDir(selectedAgent, newSkillType.trim());
      await loadAgentDetail(selectedAgent);
      showMsg("ok", `Skill folder "${newSkillType.trim()}" created`);
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Create folder failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveInstruction = async () => {
    if (!selectedAgent) return;
    setBusy(true);
    try {
      await workspacePutInstruction(selectedAgent, instruction);
      showMsg("ok", "AGENT.md saved");
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFile = async () => {
    if (!selectedAgent || !selectedSkill || !selectedFile) return;
    setBusy(true);
    try {
      await workspacePutSkillFile(selectedAgent, selectedSkill, selectedFile, fileContent);
      showMsg("ok", "Skill file saved");
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleNewFile = async () => {
    if (!selectedAgent || !newSkillType.trim() || !newMdName.trim()) return;
    let fn = newMdName.trim();
    if (!fn.endsWith(".md")) fn += ".md";
    setBusy(true);
    try {
      await workspaceCreateSkillFile(selectedAgent, newSkillType.trim(), fn, "# New skill\n\n");
      setNewMdName("");
      await loadAgentDetail(selectedAgent);
      await openFile(newSkillType.trim(), fn);
      showMsg("ok", `Created ${fn}`);
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Create file failed");
    } finally {
      setBusy(false);
    }
  };

  const stemFromFilename = (fn) =>
    String(fn || "")
      .replace(/\.md$/i, "")
      .trim() || "new_skill";

  const openAiAssistant = (kind) => {
    if (!selectedAgent) return;
    if (kind === "skill_md") {
      const dir = selectedSkill || newSkillType.trim();
      if (!dir) {
        showMsg("err", "Choose or type a skill folder (e.g. query_sql) first.");
        return;
      }
    }
    setAiKind(kind);
    setAiPrompt("");
    setAiRefine(false);
    setAiOpen(true);
  };

  const runAiGenerate = async () => {
    const user_prompt = aiPrompt.trim();
    if (!user_prompt) {
      showMsg("err", "Describe what you want (data domain, MCP, routing, etc.).");
      return;
    }
    if (!selectedAgent) return;
    const skillDir = selectedSkill || newSkillType.trim() || "query_sql";
    let skillStem = stemFromFilename(selectedFile || newMdName);

    if (aiKind === "skill_md" && aiRefine && !selectedFile && !fileContent.trim()) {
      showMsg("err", "Open a skill file or paste content before refine.");
      return;
    }
    if (aiKind === "agent_md" && aiRefine && !instruction.trim()) {
      showMsg("err", 'Nothing to refine in AGENT.md yet — uncheck "Refine" or type a draft first.');
      return;
    }

    setAiBusy(true);
    try {
      const payload = {
        kind: aiKind,
        user_prompt,
        agent_name: selectedAgent,
        mode: aiRefine ? "refine" : "create",
      };
      if (aiKind === "skill_md") {
        payload.skill_type_dir = skillDir;
        payload.skill_name = skillStem;
        if (aiRefine) payload.current_content = fileContent;
      } else if (aiRefine) {
        payload.current_content = instruction;
      }
      const data = await workspaceGenerate(payload);
      const text = data.content ?? "";
      if (aiKind === "agent_md") setInstruction(text);
      else setFileContent(text);
      const w = data.warnings || [];
      if (w.length) {
        showMsg("ok", `Draft applied. Format checks: ${w.join(" · ")}`);
      } else {
        showMsg("ok", "Draft applied. Review YAML + ## sections, then Save.");
      }
      setAiOpen(false);
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Generation failed");
    } finally {
      setAiBusy(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedAgent || !selectedSkill || !selectedFile) return;
    if (!window.confirm(`Delete ${selectedFile}?`)) return;
    setBusy(true);
    try {
      await workspaceDeleteSkillFile(selectedAgent, selectedSkill, selectedFile);
      setSelectedSkill(null);
      setSelectedFile(null);
      setFileContent("");
      await loadAgentDetail(selectedAgent);
      showMsg("ok", "File deleted");
    } catch (e) {
      const d = e.response?.data?.detail;
      showMsg("err", typeof d === "string" ? d : e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  // Inject allowed_skills / allowed_mcp_servers into AGENT.md frontmatter
  const applySelectionsToInstruction = () => {
    if (!instructionLoaded) return;
    const skillsBlock =
      allowedSkills.length > 0
        ? `allowed_skills:\n${allowedSkills.map((s) => `  - ${s}`).join("\n")}`
        : "allowed_skills: []";
    const mcpBlock =
      allowedMcpServers.length > 0
        ? `allowed_mcp_servers:\n${allowedMcpServers.map((s) => `  - ${s}`).join("\n")}`
        : "allowed_mcp_servers: []";

    // If YAML frontmatter exists, update in-place; otherwise prepend a skeleton
    const hasFrontmatter = /^---\n/.test(instruction);
    if (hasFrontmatter) {
      let updated = instruction;
      // Replace or insert allowed_skills block
      if (/^allowed_skills:/m.test(updated)) {
        updated = updated.replace(/^allowed_skills:.*?(?=^[a-z]|\Z)/ms, skillsBlock + "\n");
      } else {
        updated = updated.replace(/^(---\n)/, `$1${skillsBlock}\n`);
      }
      // Replace or insert allowed_mcp_servers block
      if (/^allowed_mcp_servers:/m.test(updated)) {
        updated = updated.replace(/^allowed_mcp_servers:.*?(?=^[a-z]|\Z)/ms, mcpBlock + "\n");
      } else {
        updated = updated.replace(/^(---\n)/, `$1${mcpBlock}\n`);
      }
      setInstruction(updated);
    } else {
      const skeleton = `---\nname: ${selectedAgent}\n${skillsBlock}\n${mcpBlock}\n---\n\n`;
      setInstruction(skeleton + instruction);
    }
    showMsg("ok", "Selections applied to AGENT.md — review and Save.");
  };

  const toggleAllowedSkill = (name) => {
    setAllowedSkills((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  const toggleAllowedMcp = (name) => {
    setAllowedMcpServers((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  };

  // Group MCP registry servers by type
  const mcpByType = mcpRegistry.reduce((acc, srv) => {
    const t = srv.type || "other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(srv);
    return acc;
  }, {});

  return (
    <>
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 shadow">
        <Header />
      </div>
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-73px)] overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <aside className="w-full md:w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shrink-0">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-6 h-6" />
            <h1 className="text-xl font-bold">Agent studio</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 break-all">
            Root: {rootPath || "—"}
          </p>
          <div className="flex gap-1 mb-2">
            <input
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
              placeholder="new_agent_name"
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
            />
            <button
              type="button"
              className="p-2 rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={busy}
              onClick={handleCreateAgent}
              title="Create agent"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-1 max-h-[40vh] overflow-y-auto">
            {agents.map((a) => (
              <li key={a}>
                <button
                  type="button"
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                    selectedAgent === a
                      ? "bg-blue-100 dark:bg-blue-900/40 font-medium"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  onClick={() => setSelectedAgent(a)}
                >
                  {a}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex-1 p-4 overflow-auto">
          {msg.text && (
            <div
              className={`mb-3 px-3 py-2 rounded text-sm ${
                msg.type === "ok"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                  : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          {!selectedAgent && (
            <p className="text-gray-500 dark:text-gray-400">Select or create an agent.</p>
          )}

          {selectedAgent && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold">{selectedAgent}</h2>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400 px-2 py-1 border border-red-300 rounded"
                  disabled={busy}
                  onClick={handleDeleteAgent}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete agent
                </button>
              </div>

              {/* AGENT.md editor */}
              <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium flex items-center gap-2">
                    <FileCode className="w-4 h-4" />
                    AGENT.md
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:underline"
                      disabled={busy || !instructionLoaded}
                      onClick={async () => {
                        if (!window.confirm("Remove AGENT.md?")) return;
                        try {
                          await workspaceDeleteInstruction(selectedAgent);
                          setInstruction("");
                          await loadAgentDetail(selectedAgent);
                        } catch (e) {
                          showMsg("err", e.response?.data?.detail || e.message);
                        }
                      }}
                    >
                      Remove file
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm bg-blue-600 text-white px-2 py-1 rounded"
                      disabled={busy}
                      onClick={handleSaveInstruction}
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm bg-violet-600 text-white px-2 py-1 rounded"
                      disabled={busy || !instructionLoaded}
                      onClick={() => openAiAssistant("agent_md")}
                      title="Draft or refine AGENT.md with LLM (Query Labs YAML + ## sections)"
                    >
                      <Sparkles className="w-3 h-3" />
                      AI draft
                    </button>
                  </div>
                </div>
                <textarea
                  className="w-full min-h-[140px] font-mono text-sm border border-gray-200 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-950"
                  placeholder="Optional agent-level instructions (planning)…"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  disabled={!instructionLoaded || busy}
                />
              </section>

              {/* Tabs: Files | Skills | MCP */}
              <section className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                  {[
                    { id: "files", icon: <FolderPlus className="w-4 h-4" />, label: "Skill Files" },
                    { id: "skills", icon: <BookOpen className="w-4 h-4" />, label: `Skills (${skillsLibrary.length})` },
                    { id: "mcp", icon: <Server className="w-4 h-4" />, label: `MCP Registry (${mcpRegistry.length})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? "border-blue-600 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-3">
                  {/* ── Tab: Skill Files ── */}
                  {activeTab === "files" && (
                    <>
                      <div className="flex flex-wrap gap-2 mb-3 items-end">
                        <div>
                          <label className="text-xs text-gray-500 block">Skill type dir</label>
                          <input
                            list="skill-suggestions"
                            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-40 bg-white dark:bg-gray-800"
                            value={newSkillType}
                            onChange={(e) => setNewSkillType(e.target.value)}
                          />
                          <datalist id="skill-suggestions">
                            {skillsLibrary.map((s) => (
                              <option key={s.name} value={s.name} />
                            ))}
                          </datalist>
                        </div>
                        <button
                          type="button"
                          className="text-sm bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded"
                          disabled={busy}
                          onClick={handleAddSkillDir}
                        >
                          Add folder
                        </button>
                        <div>
                          <label className="text-xs text-gray-500 block">New .md in folder above</label>
                          <input
                            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-36 bg-white dark:bg-gray-800"
                            placeholder="my_skill.md"
                            value={newMdName}
                            onChange={(e) => setNewMdName(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          className="text-sm bg-green-600 text-white px-3 py-1 rounded"
                          disabled={busy}
                          onClick={handleNewFile}
                        >
                          Create file
                        </button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="text-sm space-y-2 max-h-[220px] overflow-y-auto">
                          {(tree?.skill_types || []).length === 0 && (
                            <p className="text-gray-500">No skill folders yet.</p>
                          )}
                          {(tree?.skill_types || []).map((st) => (
                            <div key={st.name} className="border border-gray-100 dark:border-gray-800 rounded p-2">
                              <div className="font-medium text-blue-700 dark:text-blue-300">{st.name}/</div>
                              <ul className="ml-2 mt-1">
                                {(st.files || []).map((f) => (
                                  <li key={f}>
                                    <button
                                      type="button"
                                      className={`text-left hover:underline ${
                                        selectedSkill === st.name && selectedFile === f ? "font-semibold" : ""
                                      }`}
                                      onClick={() => openFile(st.name, f)}
                                    >
                                      {f}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>

                        <div>
                          {selectedFile ? (
                            <>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-mono">
                                  {selectedSkill}/{selectedFile}
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="text-sm text-red-600 flex items-center gap-1"
                                    disabled={busy}
                                    onClick={handleDeleteFile}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 text-sm bg-blue-600 text-white px-2 py-1 rounded"
                                    disabled={busy}
                                    onClick={handleSaveFile}
                                  >
                                    <Save className="w-3 h-3" />
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 text-sm bg-violet-600 text-white px-2 py-1 rounded"
                                    disabled={busy}
                                    onClick={() => openAiAssistant("skill_md")}
                                    title="Draft or refine this skill .md (frontmatter + Purpose / MCP / …)"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    AI draft
                                  </button>
                                </div>
                              </div>
                              <textarea
                                className="w-full min-h-[280px] font-mono text-sm border border-gray-200 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-950"
                                value={fileContent}
                                onChange={(e) => setFileContent(e.target.value)}
                                disabled={busy}
                              />
                            </>
                          ) : (
                            <div className="text-gray-500 text-sm space-y-2">
                              <p>Click a .md file to edit, or draft a new skill with AI (uses skill folder + new filename above).</p>
                              <button
                                type="button"
                                className="flex items-center gap-1 text-sm bg-violet-600 text-white px-3 py-1.5 rounded"
                                disabled={busy}
                                onClick={() => openAiAssistant("skill_md")}
                              >
                                <Sparkles className="w-3 h-3" />
                                Draft new skill with AI
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Tab: Skills Library ── */}
                  {activeTab === "skills" && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-gray-500">
                          Check skills to include in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">allowed_skills</code>. Then click Apply.
                        </p>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                          disabled={busy || !instructionLoaded}
                          onClick={applySelectionsToInstruction}
                        >
                          <Check className="w-3 h-3" />
                          Apply to AGENT.md
                        </button>
                      </div>
                      {skillsLibrary.length === 0 ? (
                        <p className="text-sm text-gray-400">No skills found in the .skills/ library.</p>
                      ) : (
                        <ul className="space-y-2 max-h-[360px] overflow-y-auto">
                          {skillsLibrary.map((skill) => (
                            <li
                              key={skill.name}
                              className="flex items-start gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            >
                              <input
                                type="checkbox"
                                id={`skill-${skill.name}`}
                                className="mt-0.5 accent-blue-600"
                                checked={allowedSkills.includes(skill.name)}
                                onChange={() => toggleAllowedSkill(skill.name)}
                              />
                              <label htmlFor={`skill-${skill.name}`} className="flex-1 cursor-pointer">
                                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                  {skill.name}
                                </div>
                                {skill.description && (
                                  <div className="text-xs text-gray-500 mt-0.5">{skill.description}</div>
                                )}
                                {skill.requires_mcp_type && (
                                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                    requires: {skill.requires_mcp_type}
                                  </span>
                                )}
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* ── Tab: MCP Registry ── */}
                  {activeTab === "mcp" && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-gray-500">
                          Check servers to include in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">allowed_mcp_servers</code>. Then click Apply.
                        </p>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded disabled:opacity-50"
                          disabled={busy || !instructionLoaded}
                          onClick={applySelectionsToInstruction}
                        >
                          <Check className="w-3 h-3" />
                          Apply to AGENT.md
                        </button>
                      </div>
                      {mcpRegistry.length === 0 ? (
                        <p className="text-sm text-gray-400">No MCP servers in the registry.</p>
                      ) : (
                        <div className="space-y-4 max-h-[360px] overflow-y-auto">
                          {Object.entries(mcpByType).map(([type, servers]) => (
                            <div key={type}>
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                                {type}
                              </div>
                              <ul className="space-y-1.5">
                                {servers.map((srv) => (
                                  <li
                                    key={srv.name}
                                    className="flex items-start gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                  >
                                    <input
                                      type="checkbox"
                                      id={`mcp-${srv.name}`}
                                      className="mt-0.5 accent-blue-600"
                                      checked={allowedMcpServers.includes(srv.name)}
                                      onChange={() => toggleAllowedMcp(srv.name)}
                                    />
                                    <label htmlFor={`mcp-${srv.name}`} className="flex-1 cursor-pointer">
                                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                        {srv.name}
                                      </div>
                                      {(srv.url || srv.command) && (
                                        <div className="text-xs text-gray-400 font-mono mt-0.5 truncate">
                                          {srv.url || srv.command}
                                        </div>
                                      )}
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {aiOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
        >
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4">
            <h2 id="ai-modal-title" className="text-lg font-semibold mb-1">
              {aiKind === "agent_md" ? "Generate AGENT.md" : "Generate skill file"}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Output follows Query Labs format: YAML frontmatter (<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">---</code>
              ) and required <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">##</code> sections for the
              loader. Set <strong>OPENAI_API_KEY</strong> on the orchestrator. Model:{" "}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">OPENAI_MODEL</code>.
            </p>
            <label className="block text-sm font-medium mb-1">What should this file do?</label>
            <textarea
              className="w-full min-h-[100px] text-sm border border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-950 mb-3"
              placeholder={
                aiKind === "agent_md"
                  ? "e.g. Route revenue questions to query_sql and docs to query_vector; be concise…"
                  : "e.g. MySQL financial_metrics MCP at http://localhost:8005/mcp; SELECT-only; tables daily_revenue…"
              }
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={aiRefine}
                onChange={(e) => setAiRefine(e.target.checked)}
              />
              Refine current editor content (merge with your instructions above)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600"
                disabled={aiBusy}
                onClick={() => setAiOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded bg-violet-600 text-white flex items-center gap-1 disabled:opacity-50"
                disabled={aiBusy}
                onClick={runAiGenerate}
              >
                <Sparkles className="w-3 h-3" />
                {aiBusy ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
