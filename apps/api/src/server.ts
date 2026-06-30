import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import { db, users, workspaces, boards, lists, cards, weeklyDigests, aiInsights } from "@collab-pm/db";
import { eq, desc } from "drizzle-orm";
import { initWebSocketServer, addYjsCard } from "./websocket";
import { queueBoardAudit, queueComplexityInference, scheduleBoardAudit } from "./ai/queue";
import { aiWorker } from "./ai/worker"; // Start the BullMQ worker process

// Ensure the worker is started
console.log("BullMQ Worker active state:", !!aiWorker);

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Log DB initialization
console.log("Database initialized:", !!db);

app.get("/api/ping", (_req, res) => {
  res.json({
    status: "ok",
    message: "pong",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Initialize / Seed a Board with default structure
 */
app.post("/api/board", async (req, res) => {
  const { boardId, name } = req.body;
  if (!boardId) {
    res.status(400).json({ error: "boardId is required" });
    return;
  }

  try {
    // Ensure a default workspace exists first
    const defaultWorkspaceId = "11111111-1111-1111-1111-111111111111";
    const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, defaultWorkspaceId)).limit(1);
    if (existingWorkspace.length === 0) {
      // Create default user first to act as owner
      const defaultUserId = "22222222-2222-2222-2222-222222222222";
      const existingUser = await db.select().from(users).where(eq(users.id, defaultUserId)).limit(1);
      if (existingUser.length === 0) {
        await db.insert(users).values({
          id: defaultUserId,
          email: "admin@collabpm.com",
          name: "Administrator",
          role: "Admin",
        });
      }

      await db.insert(workspaces).values({
        id: defaultWorkspaceId,
        name: "Main Workspace",
        ownerId: defaultUserId,
      });
    }

    const existing = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
    if (existing.length > 0) {
      res.json({ status: "exists", board: existing[0] });
      return;
    }

    // Set default sprint timelines (2 weeks from now)
    const today = new Date();
    const twoWeeksLater = new Date();
    twoWeeksLater.setDate(today.getDate() + 14);

    // Create board
    await db.insert(boards).values({
      id: boardId,
      name: name || "Default Board",
      workspaceId: defaultWorkspaceId,
      sprintStartDate: today,
      sprintEndDate: twoWeeksLater,
    });

    // Create default lists
    const todoListId = crypto.randomUUID();
    const inProgressListId = crypto.randomUUID();
    const doneListId = crypto.randomUUID();

    await db.insert(lists).values([
      { id: todoListId, boardId, name: "Todo", position: 0 },
      { id: inProgressListId, boardId, name: "In Progress", position: 1 },
      { id: doneListId, boardId, name: "Done", position: 2 },
    ]);

    // Create sample tasks
    await db.insert(cards).values([
      {
        id: crypto.randomUUID(),
        title: "Integrate Yjs WebSocket syncing",
        description: "Connect frontend board to Node WebSocket API for multiplayer CRDT state merging.",
        listId: todoListId,
        position: 0,
      },
      {
        id: crypto.randomUUID(),
        title: "Design PostgreSQL schema relations",
        description: "Write drizzle schema with workspace, board, column, and card tables.",
        listId: doneListId,
        position: 0,
      },
    ]);

    // Schedule repeatable board audit and trigger initial run
    await scheduleBoardAudit(boardId);
    await queueBoardAudit(boardId);

    res.json({ status: "created", boardId });
  } catch (error: any) {
    console.error("Board init error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Trigger manual board AI audit
 */
app.post("/api/board/:id/audit", async (req, res) => {
  const boardId = req.params.id;
  try {
    await queueBoardAudit(boardId);
    res.json({ status: "queued", message: "AI Board Audit job successfully queued." });
  } catch (error: any) {
    console.error("API Board audit error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Retrieve latest AI insights (bottlenecks and sprint risk)
 */
app.get("/api/board/:id/insights", async (req, res) => {
  const boardId = req.params.id;
  try {
    const insights = await db
      .select()
      .from(aiInsights)
      .where(eq(aiInsights.boardId, boardId))
      .limit(1);
    res.json(insights[0] || { bottlenecks: [], sprintRisk: "No sprint analysis compiled yet." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Retrieve latest Weekly Digest Markdown report
 */
app.get("/api/board/:id/digest", async (req, res) => {
  const boardId = req.params.id;
  try {
    const digests = await db
      .select()
      .from(weeklyDigests)
      .where(eq(weeklyDigests.boardId, boardId))
      .orderBy(desc(weeklyDigests.createdAt))
      .limit(1);
    res.json(digests[0] || { markdownContent: "# Weekly Sprint Digest\nNo digests have been generated yet." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
/**
 * Admin Authentication Verification
 */
app.post("/api/auth/admin", (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Incorrect admin password" });
  }
});

/**
 * Register / Sync User details in database
 */
app.post("/api/users", async (req, res) => {
  const { id, name, email, role } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: "name and email are required" });
    return;
  }
  try {
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      res.json(existing[0]);
      return;
    }
    const userId = id || crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      name,
      email,
      role: role || "Engineer",
    });
    res.json({ id: userId, name, email, role: role || "Engineer" });
  } catch (err: any) {
    console.error("User registration sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Retrieve all registered users in the database
 */
app.get("/api/users", async (_req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (err: any) {
    console.error("Retrieve users list error:", err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * Retrieve all boards (for extension)
 */
app.get("/api/boards", async (_req, res) => {
  try {
    const all = await db.select().from(boards);
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Retrieve columns (lists) on a board (for extension)
 */
app.get("/api/board/:id/lists", async (req, res) => {
  const boardId = req.params.id;
  try {
    const boardLists = await db
      .select()
      .from(lists)
      .where(eq(lists.boardId, boardId))
      .orderBy(lists.position);
    res.json(boardLists);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new card directly via API (for extension)
 */
app.post("/api/board/:boardId/card", async (req, res) => {
  const { boardId } = req.params;
  const { title, description, listId } = req.body;
  if (!title || !listId) {
    res.status(400).json({ error: "title and listId are required" });
    return;
  }

  try {
    const cardId = crypto.randomUUID();
    const existingCards = await db.select().from(cards).where(eq(cards.listId, listId));
    const position = existingCards.length;

    // 1. Insert into relational DB
    await db.insert(cards).values({
      id: cardId,
      title,
      description: description || "",
      listId,
      position,
    });

    // 2. Inject into Yjs document if connection is active
    addYjsCard(boardId, listId, { id: cardId, title, description: description || "" });

    // 3. Trigger BullMQ Complexity job
    await queueComplexityInference(cardId, title, description || "");

    res.json({ status: "success", cardId });
  } catch (err: any) {
    console.error("Extension card create error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GitHub Issues Scraper and Importer
 */
app.post("/api/board/:id/github-import", async (req, res) => {
  const boardId = req.params.id;
  const { repoUrl } = req.body;

  if (!repoUrl) {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }

  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    res.status(400).json({ error: "Invalid GitHub Repository URL" });
    return;
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  try {
    // 1. Resolve Target Column (First list on the board)
    const boardLists = await db
      .select()
      .from(lists)
      .where(eq(lists.boardId, boardId))
      .orderBy(lists.position);

    let targetListId = boardLists[0]?.id;
    if (!targetListId) {
      targetListId = crypto.randomUUID();
      await db.insert(lists).values({
        id: targetListId,
        boardId,
        name: "Todo",
        position: 0,
      });
    }

    // 2. Scrape and Paginate GitHub issues
    let page = 1;
    let importedCount = 0;
    const limit = 100;

    // Find existing card references on this list to prevent duplicates
    const existingCards = await db.select().from(cards).where(eq(cards.listId, targetListId));
    const existingUrls = existingCards.map((c) => c.description || "");

    while (true) {
      const githubUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=${limit}&page=${page}`;
      const response = await fetch(githubUrl, {
        headers: {
          "User-Agent": "CollabPM-App",
          ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
        },
      });

      if (!response.ok) {
        console.error(`GitHub API returned status ${response.status}`);
        break;
      }

      const issues = await response.json();
      if (!Array.isArray(issues) || issues.length === 0) break;

      for (const issue of issues) {
        // GitHub Issues endpoint includes pull requests
        if (issue.pull_request) continue;

        const issueUrl = issue.html_url;

        // Deduplication: check if already imported
        const isDuplicate = existingUrls.some((desc) => desc.includes(issueUrl));
        if (isDuplicate) continue;

        const cardId = crypto.randomUUID();
        const title = issue.title;
        const description = `${issue.body || ""}\n\nReference: ${issueUrl}`;

        // Save card to DB
        await db.insert(cards).values({
          id: cardId,
          title,
          description,
          listId: targetListId,
          position: existingCards.length + importedCount,
        });

        // Push updates to active Yjs instance
        addYjsCard(boardId, targetListId, { id: cardId, title, description });

        // Trigger AI Complexity job
        await queueComplexityInference(cardId, title, issue.body || "");

        importedCount++;
      }

      if (issues.length < limit) break;
      page++;
    }

    res.json({ status: "success", importedCount });
  } catch (error: any) {
    console.error("GitHub import error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create HTTP Server
const server = http.createServer(app);

// Create WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Handle upgrade requests
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host || "localhost"}`).pathname;
  if (pathname.startsWith("/ws/board/")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Initialize WebSocket Yjs setup
initWebSocketServer(wss);

server.listen(port, async () => {
  console.log(`HTTP and WebSocket server running on http://localhost:${port}`);

  // Schedule repeatable board audits for all existing boards
  try {
    const allBoards = await db.select().from(boards);
    for (const b of allBoards) {
      await scheduleBoardAudit(b.id);
      await queueBoardAudit(b.id);
    }
  } catch (err) {
    console.error("Failed to schedule repeatable board audits on startup:", err);
  }
});
