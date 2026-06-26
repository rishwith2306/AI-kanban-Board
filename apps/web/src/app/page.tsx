"use client";

import { useState, useEffect } from "react";
import { KanbanBoard } from "../components/KanbanBoard";
import { useRealtimeBoard } from "../hooks/useRealtimeBoard";
import { 
  Trello, 
  BrainCircuit, 
  Users, 
  FileText, 
  Github, 
  FolderGit2, 
  AlertTriangle,
  Play,
  Check,
  UserCheck,
  TrendingUp
} from "lucide-react";

type Tab = "board" | "ai-insights" | "team-load" | "digest" | "github";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("board");
  const defaultBoardId = "d3b07384-d113-4c90-a5c9-959c25fdf299";

  const {
    lists,
    aiInsights,
    acceptAssignment,
    isConnected
  } = useRealtimeBoard(defaultBoardId);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditMessage, setAuditMessage] = useState("");

  const [githubUrl, setGithubUrl] = useState("");
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubMessage, setGithubMessage] = useState("");

  // Seed board on mount
  useEffect(() => {
    fetch("http://localhost:4000/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId: defaultBoardId, name: "CollabPM Engineering" }),
    })
      .then((res) => res.json())
      .then((data) => console.log("Board initialized:", data))
      .catch((err) => console.error("Board seeding failed:", err));
  }, []);

  // Trigger manual board audit
  const triggerAudit = async () => {
    setAuditLoading(true);
    setAuditMessage("Queueing AI audit job in BullMQ...");
    try {
      const res = await fetch(`http://localhost:4000/api/board/${defaultBoardId}/audit`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setAuditMessage("Job added to queue! Running Gemini 2.5 Flash analysis...");
        setTimeout(() => {
          setAuditMessage("Audit completed! Results streamed in real-time.");
          setAuditLoading(false);
        }, 5000);
      } else {
        setAuditMessage(`Failed: ${data.error}`);
        setAuditLoading(false);
      }
    } catch (err: any) {
      setAuditMessage(`Error: ${err.message}`);
      setAuditLoading(false);
    }
  };

  // Compute Team Load dynamically from active cards in Yjs
  const computeTeamLoad = () => {
    const loadMap: { [userId: string]: { name: string; taskCount: number; points: number } } = {};
    
    // We mock collaborator names since they are saved in board data
    const mockUsersMap: { [id: string]: string } = {
      "user-1": "Alice Chen",
      "user-2": "Bob Johnson",
      "user-3": "Sarah Miller",
    };

    lists.forEach((list) => {
      list.cards.forEach((card) => {
        if (card.assigneeId) {
          const assigneeName = mockUsersMap[card.assigneeId] || `Collaborator (${card.assigneeId.slice(0,4)})`;
          if (!loadMap[card.assigneeId]) {
            loadMap[card.assigneeId] = { name: assigneeName, taskCount: 0, points: 0 };
          }
          loadMap[card.assigneeId].taskCount += 1;
          
          // Parse complexity points (e.g. "3 pts" -> 3)
          const ptsMatch = card.aiComplexityEstimate?.match(/(\d+)/);
          const pts = ptsMatch ? parseInt(ptsMatch[1], 10) : 1;
          loadMap[card.assigneeId].points += pts;
        }
      });
    });

    return Object.values(loadMap);
  };

  const teamLoads = computeTeamLoad();

  // Simple Markdown renderer
  const renderMarkdown = (md: string) => {
    if (!md) return <p className="text-slate-500 italic">No Weekly Digest generated yet. Trigger an AI audit to compile report.</p>;
    const lines = md.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("# ")) {
        return <h1 key={idx} className="text-2xl font-extrabold text-white mt-6 mb-3 border-b border-slate-800 pb-2">{line.slice(2)}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={idx} className="text-xl font-bold text-indigo-400 mt-5 mb-2.5">{line.slice(3)}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={idx} className="text-lg font-semibold text-slate-200 mt-4 mb-2">{line.slice(4)}</h3>;
      }
      if (line.startsWith("- ")) {
        return <li key={idx} className="ml-5 list-disc text-slate-300 my-1 leading-relaxed">{line.slice(2)}</li>;
      }
      if (line.trim() === "") {
        return <div key={idx} className="h-3.5" />;
      }
      return <p key={idx} className="text-slate-350 text-sm leading-relaxed my-2">{line}</p>;
    });
  };

  const handleGithubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim() || githubLoading) return;

    setGithubLoading(true);
    setGithubMessage("Connecting to GitHub and scraping open issues...");

    try {
      const res = await fetch(`http://localhost:4000/api/board/${defaultBoardId}/github-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: githubUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setGithubMessage(`Import complete! Scraped and synced ${data.importedCount} new issues.`);
        setGithubUrl("");
      } else {
        setGithubMessage(`Import failed: ${data.error}`);
      }
    } catch (err: any) {
      setGithubMessage(`Error: ${err.message}`);
    } finally {
      setGithubLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <Trello className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-extrabold text-lg leading-tight tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                CollabPM
              </h1>
              <span className="text-[10px] text-indigo-400 font-bold tracking-wider uppercase">
                AI Powered CRDT Board
              </span>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("board")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "board"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Trello className="w-4 h-4" />
              Kanban Board
            </button>

            <button
              onClick={() => setActiveTab("ai-insights")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "ai-insights"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-3">
                <BrainCircuit className="w-4 h-4" />
                AI Insights
              </span>
              {aiInsights.assignmentSuggestions.length > 0 && (
                <span className="bg-amber-500 text-slate-950 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                  {aiInsights.assignmentSuggestions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("team-load")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "team-load"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Users className="w-4 h-4" />
              Team Load
            </button>

            <button
              onClick={() => setActiveTab("digest")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "digest"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <FileText className="w-4 h-4" />
              Weekly Digest
            </button>

            <button
              onClick={() => setActiveTab("github")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${
                activeTab === "github"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Github className="w-4 h-4" />
              GitHub Importer
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-350 text-xs">
              AI
            </div>
            <div>
              <div className="text-xs font-bold text-white">Gemini 2.5 Flash</div>
              <div className="text-[10px] text-slate-500">Active Audit Agent</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Dashboard Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {activeTab === "board" && (
          <KanbanBoard boardId={defaultBoardId} />
        )}

        {activeTab === "ai-insights" && (
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-slate-850 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <BrainCircuit className="w-6 h-6 text-indigo-400" />
                  AI Insights & Audit
                </h2>
                <p className="text-slate-400 text-sm">
                  Audits columns, calculates risk weights, and proposes task assignments.
                </p>
              </div>

              {/* Manual Audit Trigger */}
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={triggerAudit}
                  disabled={auditLoading || !isConnected}
                  className="flex items-center gap-2 px-4.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition"
                >
                  <Play className="w-4 h-4" />
                  {auditLoading ? "Auditing Board..." : "Trigger AI Board Audit"}
                </button>
                {auditMessage && (
                  <span className="text-[11px] text-indigo-400 font-medium">
                    {auditMessage}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sprint Risk Card */}
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4 lg:col-span-1">
                <h3 className="font-semibold text-white flex items-center gap-2 text-sm uppercase tracking-wider text-slate-400">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Sprint Risk assessment
                </h3>
                {aiInsights.sprintRisk ? (
                  <div className="space-y-3">
                    <div className={`px-3 py-1 rounded-md text-xs font-bold w-fit ${
                      aiInsights.sprintRisk.riskLevel === "High" 
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                        : aiInsights.sprintRisk.riskLevel === "Medium"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    }`}>
                      {aiInsights.sprintRisk.riskLevel} Sprint Risk
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {aiInsights.sprintRisk.summary}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    No sprint timeline assessments compiled. Click trigger above to audit.
                  </div>
                )}
              </div>

              {/* Bottleneck Audits */}
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4 lg:col-span-2">
                <h3 className="font-semibold text-white flex items-center gap-2 text-sm uppercase tracking-wider text-slate-400">
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                  Column Bottleneck Analysis
                </h3>
                {aiInsights.bottlenecks && aiInsights.bottlenecks.length > 0 ? (
                  <div className="space-y-4">
                    {aiInsights.bottlenecks.map((bottleneck, idx) => (
                      <div key={idx} className="p-4 rounded-lg bg-slate-950 border border-slate-850 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-sm">Column: {bottleneck.columnName}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            bottleneck.riskLevel === "High" 
                              ? "bg-rose-500/10 text-rose-400" 
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {bottleneck.count} cards • {bottleneck.riskLevel} Load
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {bottleneck.likelyCause}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">
                    No column bottleneck anomalies found.
                  </div>
                )}
              </div>
            </div>

            {/* Auto-Assignment Suggestions */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2 text-sm uppercase tracking-wider text-slate-400">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Collaborator Assignment Recommendations
              </h3>
              {aiInsights.assignmentSuggestions && aiInsights.assignmentSuggestions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiInsights.assignmentSuggestions.map((sug, idx) => (
                    <div key={idx} className="p-5 rounded-lg bg-slate-950 border border-slate-850 flex flex-col justify-between gap-4">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-indigo-400">Task: {sug.cardTitle}</div>
                        <div className="text-sm font-bold text-white">
                          Suggesting: <span className="underline decoration-indigo-500">{sug.suggestedAssigneeName}</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {sug.reason}
                        </p>
                      </div>
                      <button
                        onClick={() => acceptAssignment(sug.cardId, sug.suggestedAssigneeId)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-md transition flex items-center gap-1.5 justify-center"
                      >
                        <Check className="w-4 h-4" /> Accept Assignment
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">
                  All active cards have assignees, or audit hasn't flagged suggestions.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "team-load" && (
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2 border-b border-slate-850 pb-4">
              <Users className="w-6 h-6 text-indigo-400" />
              Team Load Balancing
            </h2>
            <p className="text-slate-400 text-sm max-w-xl">
              Calculates task distributions and total estimated story points currently assigned to each active collaborator.
            </p>

            {teamLoads.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {teamLoads.map((load, idx) => (
                  <div key={idx} className="p-6 rounded-xl border border-slate-850 bg-slate-900/40 space-y-3">
                    <h3 className="font-bold text-lg text-white">{load.name}</h3>
                    <div className="flex justify-between items-center text-xs text-slate-400 border-t border-slate-800/60 pt-3">
                      <span>Active Tasks:</span>
                      <span className="font-mono text-sm font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                        {load.taskCount}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-400">
                      <span>Total Story Points:</span>
                      <span className="font-mono text-sm font-bold text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                        {load.points} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 py-16">
                No load indicators available. Add assignees and complexity scores to task cards to view distribution metrics.
              </div>
            )}
          </div>
        )}

        {activeTab === "digest" && (
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2 border-b border-slate-850 pb-4">
              <FileText className="w-6 h-6 text-indigo-400" />
              Weekly Sprint Digest Reports
            </h2>
            <p className="text-slate-400 text-sm max-w-xl">
              Detailed markdown reports summarizing completion velocity, backlog metrics, and bottleneck recommendations.
            </p>
            
            <div className="p-8 rounded-xl border border-slate-850 bg-slate-900/30 max-w-3xl leading-relaxed shadow-lg">
              {renderMarkdown(aiInsights.weeklyDigest)}
            </div>
          </div>
        )}

        {activeTab === "github" && (
          <div className="flex-1 p-8 overflow-y-auto space-y-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2 border-b border-slate-850 pb-4">
              <FolderGit2 className="w-6 h-6 text-indigo-400" />
              GitHub Issues Importer
            </h2>
            <p className="text-slate-400 max-w-xl">
              Paste a public GitHub repository link (e.g. <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-400">https://github.com/facebook/react</code>) to scrape and import active open issues as board cards automatically.
            </p>
            
            <form onSubmit={handleGithubImport} className="max-w-xl p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
              <input
                type="text"
                placeholder="https://github.com/org/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                disabled={githubLoading}
                className="w-full bg-slate-950 text-white border border-slate-850 rounded-lg p-3 text-sm focus:outline-none focus:border-indigo-500"
              />
              <button 
                type="submit"
                disabled={githubLoading}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-850 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition"
              >
                {githubLoading ? "Importing Issues..." : "Import Repository Issues"}
              </button>
              {githubMessage && (
                <div className="text-xs text-indigo-400 mt-2 font-medium">
                  {githubMessage}
                </div>
              )}
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
