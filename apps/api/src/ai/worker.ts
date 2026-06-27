import { Worker, Job } from "bullmq";
import * as Y from "yjs";
// @ts-ignore
import { docs } from "y-websocket/bin/utils";
import { connection } from "./queue";
import { 
  db, 
  cards, 
  lists, 
  boards, 
  users, 
  aiInsights, 
  weeklyDigests 
} from "@collab-pm/db";
import { eq } from "drizzle-orm";
import { 
  inferComplexity, 
  analyzeBoardState, 
  generateWeeklyDigest, 
  BoardData, 
  BoardAuditResult 
} from "./gemini";

// Helper to push AI updates to active Yjs documents
export function updateYjsCardField(boardId: string, cardId: string, field: string, value: any) {
  const doc = docs.get(boardId);
  if (!doc) return;

  const listsArray = doc.getArray("lists");
  doc.transact(() => {
    for (let i = 0; i < listsArray.length; i++) {
      const listMap = listsArray.get(i);
      if (listMap instanceof Y.Map) {
        const cardsArray = listMap.get("cards");
        if (cardsArray instanceof Y.Array) {
          for (let j = 0; j < cardsArray.length; j++) {
            const cardMap = cardsArray.get(j);
            if (cardMap instanceof Y.Map && cardMap.get("id") === cardId) {
              if (field === "aiTags") {
                const tagsArray = new Y.Array();
                if (Array.isArray(value)) {
                  tagsArray.insert(0, value);
                }
                cardMap.set("aiTags", tagsArray);
              } else {
                cardMap.set(field, value);
              }
              console.log(`Pushed real-time Yjs field update: ${field} on card ${cardId}`);
              return;
            }
          }
        }
      }
    }
  });
}

// Helper to push board-level insights (bottlenecks, sprint risks, suggestions) to Yjs doc
export function updateYjsBoardInsights(boardId: string, auditResult: BoardAuditResult, digestMarkdown: string) {
  const doc = docs.get(boardId);
  if (!doc) return;

  doc.transact(() => {
    const insightsMap = doc.getMap("insights");
    insightsMap.set("bottlenecks", auditResult.bottlenecks);
    insightsMap.set("sprintRisk", auditResult.sprintRisk);
    insightsMap.set("assignmentSuggestions", auditResult.assignmentSuggestions);
    insightsMap.set("weeklyDigest", digestMarkdown);
    insightsMap.set("lastAuditedAt", new Date().toISOString());
  });
  console.log(`Pushed real-time Yjs board insights for board ${boardId}`);
}

// Processors
async function handleComplexityInference(job: Job) {
  const { cardId, title, description } = job.data;
  console.log(`Processing complexity inference for card: ${cardId}`);

  const result = await inferComplexity(title, description);

  // 1. Update card in DB
  await db.update(cards)
    .set({ aiComplexityEstimate: result.complexity, updatedAt: new Date() })
    .where(eq(cards.id, cardId));

  // 2. Fetch boardId to sync Yjs
  const cardRecord = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (cardRecord.length > 0) {
    const listRecord = await db.select().from(lists).where(eq(lists.id, cardRecord[0].listId)).limit(1);
    if (listRecord.length > 0) {
      updateYjsCardField(listRecord[0].boardId, cardId, "aiComplexityEstimate", result.complexity);
    }
  }
}

async function handleBoardAudit(job: Job) {
  const { boardId } = job.data;
  console.log(`Processing audit for board: ${boardId}`);

  // Fetch Board Details
  const boardRecord = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
  if (boardRecord.length === 0) throw new Error(`Board not found: ${boardId}`);

  // Fetch Board lists and cards
  const dbLists = await db.select().from(lists).where(eq(lists.boardId, boardId)).orderBy(lists.position);
  const listsWithCards = [];

  for (const list of dbLists) {
    const dbCards = await db.select().from(cards).where(eq(cards.listId, list.id)).orderBy(cards.position);
    listsWithCards.push({
      id: list.id,
      name: list.name,
      cards: dbCards.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description || "",
        assigneeId: c.assigneeId,
        aiComplexityEstimate: c.aiComplexityEstimate,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  }

  // Fetch Board collaborators (mock or query users)
  // For standard usage, we'll suggest from all users in the system
  const dbUsers = await db.select().from(users);
  const collaborators = dbUsers.map((u) => ({
    id: u.id,
    name: u.name || u.email,
  }));

  const boardData: BoardData = {
    boardName: boardRecord[0].name,
    sprintStartDate: boardRecord[0].sprintStartDate ? boardRecord[0].sprintStartDate.toISOString() : null,
    sprintEndDate: boardRecord[0].sprintEndDate ? boardRecord[0].sprintEndDate.toISOString() : null,
    collaborators,
    lists: listsWithCards,
  };

  // Run Gemini analysis
  const auditResult = await analyzeBoardState(boardData);
  const digestMarkdown = await generateWeeklyDigest(boardData, auditResult);

  // 1. Save insights to DB (upsert)
  const existingInsights = await db.select().from(aiInsights).where(eq(aiInsights.boardId, boardId)).limit(1);
  if (existingInsights.length > 0) {
    await db.update(aiInsights)
      .set({
        bottlenecks: auditResult.bottlenecks,
        sprintRisk: auditResult.sprintRisk.summary,
      })
      .where(eq(aiInsights.boardId, boardId));
  } else {
    await db.insert(aiInsights).values({
      boardId,
      bottlenecks: auditResult.bottlenecks,
      sprintRisk: auditResult.sprintRisk.summary,
    });
  }

  // 2. Save Digest to DB
  await db.insert(weeklyDigests).values({
    boardId,
    markdownContent: digestMarkdown,
  });

  // 3. Auto-assign tasks based on suggestions
  if (Array.isArray(auditResult.assignmentSuggestions)) {
    for (const suggestion of auditResult.assignmentSuggestions) {
      if (suggestion.cardId && suggestion.suggestedAssigneeId) {
        await db.update(cards)
          .set({ assigneeId: suggestion.suggestedAssigneeId, updatedAt: new Date() })
          .where(eq(cards.id, suggestion.cardId));

        updateYjsCardField(boardId, suggestion.cardId, "assigneeId", suggestion.suggestedAssigneeId);
        console.log(`Auto-assigned card "${suggestion.cardTitle || suggestion.cardId}" to collaborator ${suggestion.suggestedAssigneeName}`);
      }
    }
  }

  // 4. Sync insights to connected Yjs instances
  updateYjsBoardInsights(boardId, auditResult, digestMarkdown);

  console.log(`Audit completed for board: ${boardId}`);
}

// Initialize BullMQ Worker
export const aiWorker = new Worker(
  "ai-analysis",
  async (job: Job) => {
    if (job.name === "infer-complexity") {
      await handleComplexityInference(job);
    } else if (job.name === "board-audit" || job.name === "board-audit-repeat") {
      await handleBoardAudit(job);
    }
  },
  { connection: connection as any }
);

aiWorker.on("completed", (job) => {
  console.log(`Job completed: ${job.id}`);
});

aiWorker.on("failed", (job, err) => {
  console.error(`Job failed: ${job?.id}`, err);
});
