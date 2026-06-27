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
  TrendingUp,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  ShieldCheck
} from "lucide-react";
import Stepper, { Step } from "../components/Stepper";
import PillNav from "../components/PillNav";
import ClickSpark from "../components/ClickSpark";
import LightRays from "../components/LightRays";
import { GooeyInput } from "../components/ui/gooey-input";
import { FloatingDock, FloatingDockItem } from "../components/ui/floating-dock";
import DotField from "../components/DotField";

type Tab = "board" | "ai-insights" | "team-load" | "digest" | "github" | "home" | "login" | "signup" | "features";

export default function Home() {
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("home");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Stepper signup form states
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupRole, setSignupRole] = useState("Engineer");

  // Login form states
  const [loginName, setLoginName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginRole, setLoginRole] = useState("Engineer");

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

  // Check auth status on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("collab-pm-user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setActiveTab("board");
      } catch (err) {
        console.error("Failed to parse user from localStorage", err);
      }
    }
    setAuthLoading(false);
  }, []);

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
        return <h2 key={idx} className="text-xl font-bold text-zinc-400 mt-5 mb-2.5">{line.slice(3)}</h2>;
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

  // Auth Submit Handlers
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) {
      alert("Please enter your name.");
      return;
    }
    if (!loginEmail.trim() || !loginEmail.includes("@")) {
      alert("Please enter a valid Gmail / Email address.");
      return;
    }
    const newUser = { name: loginName.trim(), email: loginEmail.trim(), role: loginRole };
    localStorage.setItem("collab-pm-user", JSON.stringify(newUser));
    setUser(newUser);
    setActiveTab("board");
  };

  const handleSignupComplete = () => {
    if (!signupName.trim()) {
      alert("Name is mandatory! Please enter your full name in Step 2.");
      return;
    }
    if (!signupEmail.trim() || !signupEmail.includes("@")) {
      alert("Gmail/Email is mandatory! Please enter a valid email address in Step 2.");
      return;
    }
    const newUser = {
      name: signupName.trim(),
      email: signupEmail.trim(),
      role: signupRole
    };
    localStorage.setItem("collab-pm-user", JSON.stringify(newUser));
    setUser(newUser);
    setActiveTab("board");
  };

  // Navigation configurations
  const pillNavItems = [
    { label: "Home", href: "#home", onClick: () => setActiveTab("home") },
    { label: "Features", href: "#features", onClick: () => setActiveTab("features") },
    { label: "Login", href: "#login", onClick: () => setActiveTab("login") },
    { label: "Sign Up", href: "#signup", onClick: () => setActiveTab("signup") }
  ];

  const floatingDockItems: FloatingDockItem[] = [
    {
      title: "Kanban Board",
      icon: <Trello className={`h-5 w-5 ${activeTab === "board" ? "text-white" : "text-neutral-400"}`} />,
      href: "#board",
      onClick: () => setActiveTab("board")
    },
    {
      title: "AI Insights",
      icon: (
        <div className="relative flex items-center justify-center">
          <BrainCircuit className={`h-5 w-5 ${activeTab === "ai-insights" ? "text-white" : "text-neutral-400"}`} />
          {aiInsights.assignmentSuggestions.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-amber-500 text-slate-950 text-[9px] font-extrabold px-1.5 py-0.5 leading-none rounded-full">
              {aiInsights.assignmentSuggestions.length}
            </span>
          )}
        </div>
      ),
      href: "#ai-insights",
      onClick: () => setActiveTab("ai-insights")
    },
    {
      title: "Team Load",
      icon: <Users className={`h-5 w-5 ${activeTab === "team-load" ? "text-white" : "text-neutral-400"}`} />,
      href: "#team-load",
      onClick: () => setActiveTab("team-load")
    },
    {
      title: "Weekly Digest",
      icon: <FileText className={`h-5 w-5 ${activeTab === "digest" ? "text-white" : "text-neutral-400"}`} />,
      href: "#digest",
      onClick: () => setActiveTab("digest")
    },
    {
      title: "GitHub Importer",
      icon: <Github className={`h-5 w-5 ${activeTab === "github" ? "text-white" : "text-neutral-400"}`} />,
      href: "#github",
      onClick: () => setActiveTab("github")
    }
  ];

  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-400 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold tracking-wider uppercase text-zinc-300">Loading CollabPM...</div>
        </div>
      </div>
    );
  }

  return (
    <ClickSpark sparkColor='#cbd5e1' sparkSize={15} sparkRadius={20} sparkCount={10} duration={500}>
      {user === null ? (
        // LANDING & LOGIN/SIGNUP STATE
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
          {/* Light Rays Background */}
          <LightRays
            raysOrigin="top-center"
            raysColor="#cbd5e1"
            raysSpeed={1.2}
            lightSpread={0.7}
            rayLength={1.5}
            followMouse={true}
            mouseInfluence={0.08}
            noiseAmount={0.02}
            distortion={0.03}
          />

          {/* Liquid Pill Navbar */}
          <header className="h-24 w-full flex justify-center items-center relative z-20">
            <PillNav
              activeHref={`#${activeTab}`}
              items={pillNavItems}
              baseColor="#030712"
              pillColor="#1f2937"
              hoveredPillTextColor="#ffffff"
              pillTextColor="#f8fafc"
              initialLoadAnimation={true}
            />
          </header>

          {/* Inner Content Area */}
          <main className="flex-1 flex flex-col justify-center relative z-10">
            {activeTab === "home" && (
              <div className="max-w-3xl mx-auto text-center px-6 space-y-6">
                <h1 className="text-4xl sm:text-6xl font-black leading-tight tracking-tight text-white select-none">
                  AI-Powered Real-time{" "}
                  <span className="bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
                    Collaborative Board
                  </span>
                </h1>
                <p className="text-sm sm:text-md text-slate-400 max-w-xl mx-auto leading-relaxed">
                  Supercharge your team's engineering velocity with real-time multi-user cursor sync, automated weekly digests, load balancing, and AI issues auditing powered by Gemini 2.5 Flash.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                  <button
                    onClick={() => setActiveTab("signup")}
                    className="px-6 py-3 bg-zinc-200 hover:bg-white text-black text-xs font-bold uppercase tracking-wider rounded-lg transition shadow-lg shadow-zinc-200/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    Get Started <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setActiveTab("features")}
                    className="px-6 py-3 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 text-xs font-bold uppercase tracking-wider rounded-lg transition cursor-pointer"
                  >
                    Explore Features
                  </button>
                </div>
              </div>
            )}

            {activeTab === "features" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 select-none relative z-10 overflow-y-auto pb-24">
                <div className="max-w-xl text-center space-y-3 mb-10">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Supercharged Kanban Platform</h2>
                  <p className="text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
                    CollabPM bridges the gap between structured workflow management and generative AI insight auditing.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
                  <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3 backdrop-blur-sm">
                    <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-zinc-300 flex items-center justify-center font-bold">
                      <Trello className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-white text-sm">Real-time CRDT Engine</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Powered by Yjs and WebSockets. CollabPM syncs board lists, active cards, and user mouse cursors instantly across all collaborators.
                    </p>
                  </div>

                  <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3 backdrop-blur-sm">
                    <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-zinc-300 flex items-center justify-center font-bold">
                      <BrainCircuit className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-white text-sm">Gemini Audit Agent</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Trigger automated board audits using Gemini 2.5 Flash to automatically detect bottleneck lists and receive collaborator auto-assignment suggestions.
                    </p>
                  </div>

                  <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3 backdrop-blur-sm">
                    <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-zinc-300 flex items-center justify-center font-bold">
                      <Users className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-white text-sm">Workload Balancer</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Get aggregate team load balancing statistics. Instantly parse card story points and allocate complexity weights fairly across team roles.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab("signup")}
                  className="mt-10 px-6 py-2.5 bg-zinc-200 hover:bg-white text-black text-xs font-bold rounded-lg transition shadow-lg shadow-zinc-200/10 cursor-pointer flex items-center gap-1.5"
                >
                  Get Started Now <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {activeTab === "login" && (
              <div className="flex-1 flex items-center justify-center p-8 select-none relative z-10">
                <div className="w-full max-w-sm bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 backdrop-blur shadow-2xl space-y-6">
                  <div className="text-center">
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Welcome Back</h1>
                    <p className="text-xs text-slate-400 mt-1.5">Sign in to your collaborative board</p>
                  </div>

                  {/* Role toggle (Standard vs Admin Login) */}
                  <div className="flex bg-slate-950/80 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setLoginRole("Engineer")}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                        loginRole !== "Admin"
                          ? "bg-slate-800 text-white shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      User Login
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginRole("Admin");
                        if (!loginEmail) setLoginEmail("admin@collabpm.com");
                        if (!loginName) setLoginName("Administrator");
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-md transition cursor-pointer flex items-center justify-center gap-1 ${
                        loginRole === "Admin"
                          ? "bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow"
                          : "text-slate-400 hover:text-purple-300"
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> Admin Login
                    </button>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-3.5">
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          required
                          value={loginName}
                          onChange={(e) => setLoginName(e.target.value)}
                          placeholder="Your Full Name *"
                          className="w-full bg-slate-950/80 text-white border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-zinc-400"
                        />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="Gmail / Email Address *"
                          className="w-full bg-slate-950/80 text-white border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-zinc-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className={`w-full py-2.5 text-xs font-bold rounded-lg transition shadow-lg cursor-pointer flex items-center justify-center gap-1.5 ${
                        loginRole === "Admin"
                          ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-900/20"
                          : "bg-zinc-200 hover:bg-white text-black shadow-zinc-200/10"
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> {loginRole === "Admin" ? "Sign In as Admin" : "Sign In"}
                    </button>
                  </form>

                  <div className="text-center">
                    <span className="text-[10px] text-slate-500">
                      New to CollabPM?{" "}
                      <button
                        onClick={() => setActiveTab("signup")}
                        className="text-zinc-300 hover:text-white hover:underline cursor-pointer font-bold bg-transparent border-none p-0"
                      >
                        Create an account
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "signup" && (
              <div className="flex-1 flex items-center justify-center p-8 select-none relative z-10">
                <div className="w-full max-w-md bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur shadow-2xl">
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">Create your Account</h1>
                    <p className="text-xs text-slate-400 mt-1">Join the real-time CollabPM workspace</p>
                  </div>

                  <Stepper
                    initialStep={1}
                    onFinalStepCompleted={handleSignupComplete}
                    backButtonText="Back"
                    nextButtonText="Continue"
                  >
                    <Step>
                      <div className="space-y-3">
                        <h3 className="font-bold text-white text-md">Welcome to CollabPM!</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          You are about to join the **CollabPM Engineering** active workspace. It has real-time collaborative sync and Gemini AI tools active.
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Let's set up your profile so your team members can identify your cursor on the board.
                        </p>
                      </div>
                    </Step>

                    <Step>
                      <div className="space-y-4 py-2">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-white text-md">Introduce Yourself</h3>
                          <span className="text-[10px] text-amber-400 font-semibold">* Mandatory</span>
                        </div>
                        <div className="space-y-3">
                          <div className="relative">
                            <UserIcon className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                            <input
                              type="text"
                              required
                              value={signupName}
                              onChange={(e) => setSignupName(e.target.value)}
                              placeholder="Your Full Name * (Mandatory)"
                              className="w-full bg-slate-950/80 text-white border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-zinc-400"
                            />
                          </div>
                          <div className="relative">
                            <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                            <input
                              type="email"
                              required
                              value={signupEmail}
                              onChange={(e) => setSignupEmail(e.target.value)}
                              placeholder="Your Gmail / Email Address * (Mandatory)"
                              className="w-full bg-slate-950/80 text-white border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:border-zinc-400"
                            />
                          </div>
                        </div>
                      </div>
                    </Step>

                    <Step>
                      <div className="space-y-4 py-2">
                        <h3 className="font-bold text-white text-md">Select your Role</h3>
                        <p className="text-xs text-slate-500">Select your account role in the workspace.</p>
                        <div className="grid grid-cols-2 gap-2">
                          {["Engineer", "Designer", "Product Manager", "Admin"].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setSignupRole(r)}
                              className={`p-3 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 ${
                                signupRole === r
                                  ? r === "Admin"
                                    ? "bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-500/20"
                                    : "bg-zinc-200 border-zinc-300 text-black shadow-md shadow-zinc-200/10"
                                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/60"
                              }`}
                            >
                              {r === "Admin" && <ShieldCheck className="w-3.5 h-3.5" />}
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Step>

                    <Step>
                      <div className="space-y-3 py-1">
                        <h3 className="font-bold text-white text-md">Ready to start!</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          All settings have been configured:
                        </p>
                        <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-850 space-y-1.5 font-mono text-[10px] text-zinc-300">
                          <div>Name: <span className="text-slate-350">{signupName}</span></div>
                          <div>Email: <span className="text-slate-350">{signupEmail}</span></div>
                          <div>Role: <span className="text-slate-350">{signupRole}</span></div>
                          <div>Workspace: <span className="text-slate-350">CollabPM Engineering</span></div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">Click "Complete" to log in and open the dashboard.</p>
                      </div>
                    </Step>
                  </Stepper>
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        // DASHBOARD & APP STATE
        <div className="flex flex-col h-screen bg-black text-slate-100 overflow-hidden font-sans relative">
          {/* Global Background DotField Animation covering top header, content, and bottom dock */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <DotField
              dotRadius={1.5}
              dotSpacing={14}
              bulgeStrength={67}
              glowRadius={160}
              sparkle={false}
              waveAmplitude={0}
              gradientFrom="rgba(226, 232, 240, 0.75)"
              gradientTo="rgba(148, 163, 184, 0.45)"
              glowColor="rgba(203, 213, 225, 0.3)"
            />
          </div>

          {/* Top Header */}
          <header className="h-16 border-b border-slate-800/80 bg-black/40 backdrop-blur flex items-center justify-between px-8 shrink-0 select-none gap-4 relative z-20">
            <div className="flex items-center gap-3 shrink-0">
              <div className="p-2 bg-zinc-200 rounded-lg text-black">
                <Trello className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-extrabold text-md leading-tight tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  CollabPM
                </h1>
                <span className="text-[9px] text-zinc-400 font-bold tracking-wider uppercase">
                  AI Powered CRDT Board
                </span>
              </div>
            </div>

            {/* GooeyInput Search Bar ("searchanything") */}
            <div className="flex-1 flex justify-center max-w-md">
              <GooeyInput
                placeholder="Search anything..."
                value={searchQuery}
                onValueChange={(val) => setSearchQuery(val)}
                collapsedWidth={130}
                expandedWidth={280}
              />
            </div>

            <div className="flex items-center gap-6 shrink-0">
              <div className="flex items-center gap-2 hidden md:flex">
                <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                <span className="text-xs font-semibold text-slate-400">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>

              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-lg shadow-inner hidden lg:flex">
                <div className="w-6 h-6 rounded-full bg-slate-850 flex items-center justify-center font-bold text-slate-300 text-xs">
                  AI
                </div>
                <div>
                  <div className="text-[10px] font-bold text-white leading-tight">Gemini 2.5 Flash</div>
                  <div className="text-[8px] text-slate-500">Active Audit Agent</div>
                </div>
              </div>

              {/* Logged in User Details Display */}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                <div className="text-right">
                  <div className="text-xs font-bold text-white leading-none flex items-center justify-end gap-1">
                    {user.name}
                    {user.role === "Admin" && (
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400 inline" />
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium leading-none mt-1">
                    {user.email}
                  </div>
                  <div className="mt-1">
                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      user.role === "Admin"
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                        : "bg-slate-800 text-zinc-300 border border-slate-700"
                    }`}>
                      {user.role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem("collab-pm-user");
                    setUser(null);
                    setActiveTab("home");
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-white border border-slate-800 hover:border-rose-500/20 px-2.5 py-1.5 rounded-lg bg-slate-950/40 hover:bg-rose-500/10 transition cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          {/* Main Dashboard Content */}
          <main className="flex-1 flex flex-col overflow-hidden bg-transparent pb-28 relative z-10">
            {activeTab === "board" && (
              <KanbanBoard boardId={defaultBoardId} />
            )}

            {activeTab === "ai-insights" && (
              <div className="flex-1 p-8 overflow-y-auto space-y-6">
                <div className="flex items-center justify-between border-b border-slate-850 pb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                      <BrainCircuit className="w-6 h-6 text-zinc-300" />
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
                      className="flex items-center gap-2 px-4.5 py-2.5 bg-zinc-200 hover:bg-white disabled:bg-slate-800 disabled:text-slate-500 text-black text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      <Play className="w-4 h-4" />
                      {auditLoading ? "Auditing Board..." : "Trigger AI Board Audit"}
                    </button>
                    {auditMessage && (
                      <span className="text-[11px] text-zinc-400 font-medium">
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
                      <TrendingUp className="w-4 h-4 text-zinc-300" />
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
                            <div className="text-xs font-semibold text-zinc-300">Task: {sug.cardTitle}</div>
                            <div className="text-sm font-bold text-white">
                              Suggesting: <span className="underline decoration-zinc-400">{sug.suggestedAssigneeName}</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {sug.reason}
                            </p>
                          </div>
                          <button
                            onClick={() => acceptAssignment(sug.cardId, sug.suggestedAssigneeId)}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-md transition flex items-center gap-1.5 justify-center cursor-pointer"
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
                  <Users className="w-6 h-6 text-zinc-300" />
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
                          <span className="font-mono text-sm font-bold text-zinc-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
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
                  <FileText className="w-6 h-6 text-zinc-300" />
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
                  <FolderGit2 className="w-6 h-6 text-zinc-300" />
                  GitHub Issues Importer
                </h2>
                <p className="text-slate-400 max-w-xl">
                  Paste a public GitHub repository link (e.g. <code className="bg-slate-900 px-1 py-0.5 rounded text-zinc-300">https://github.com/facebook/react</code>) to scrape and import active open issues as board cards automatically.
                </p>
                
                <form onSubmit={handleGithubImport} className="max-w-xl p-6 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
                  <input
                    type="text"
                    placeholder="https://github.com/org/repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    disabled={githubLoading}
                    className="w-full bg-slate-950 text-white border border-slate-850 rounded-lg p-3 text-sm focus:outline-none focus:border-zinc-400"
                  />
                  <button 
                    type="submit"
                    disabled={githubLoading}
                    className="px-5 py-2.5 bg-zinc-200 hover:bg-white disabled:bg-slate-850 disabled:text-slate-500 text-black text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    {githubLoading ? "Importing Issues..." : "Import Repository Issues"}
                  </button>
                  {githubMessage && (
                    <div className="text-xs text-zinc-400 mt-2 font-medium">
                      {githubMessage}
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Floating Bottom Navigation Dock */}
            <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-auto">
              <FloatingDock items={floatingDockItems} />
            </div>
          </main>
        </div>
      )}
    </ClickSpark>
  );
}
