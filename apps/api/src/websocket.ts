import { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import * as Y from "yjs";
// @ts-ignore
import { setupWSConnection, docs, WSSharedDoc } from "y-websocket/bin/utils";
import { db, boardStates, lists, cards } from "@collab-pm/db";
import { eq, inArray } from "drizzle-orm";
import { queueComplexityInference } from "./ai/queue";

// Synchronize database tables to match Yjs state
async function syncYjsToRelationalDB(boardId: string, doc: Y.Doc) {
  try {
    const listsArray = doc.getArray("lists");
    const activeListIds: string[] = [];
    const activeCardIds: string[] = [];

    for (let i = 0; i < listsArray.length; i++) {
      const listMap = listsArray.get(i);
      if (!(listMap instanceof Y.Map)) continue;

      const listId = listMap.get("id") as string;
      const listName = listMap.get("name") as string;
      const listPosition = listMap.get("position") as number;
      activeListIds.push(listId);

      // Upsert list
      const existingList = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
      if (existingList.length > 0) {
        await db.update(lists)
          .set({ name: listName, position: listPosition })
          .where(eq(lists.id, listId));
      } else {
        await db.insert(lists).values({
          id: listId,
          boardId,
          name: listName,
          position: listPosition,
        });
      }

      const cardsArray = listMap.get("cards");
      if (cardsArray instanceof Y.Array) {
        for (let j = 0; j < cardsArray.length; j++) {
          const cardMap = cardsArray.get(j);
          if (!(cardMap instanceof Y.Map)) continue;

          const cardId = cardMap.get("id") as string;
          const cardTitleText = cardMap.get("title");
          const cardTitle = cardTitleText instanceof Y.Text ? cardTitleText.toString() : (cardTitleText as string || "");

          const cardDescText = cardMap.get("description");
          const cardDesc = cardDescText instanceof Y.Text ? cardDescText.toString() : (cardDescText as string || "");

          const cardPosition = cardMap.get("position") as number;
          const assigneeId = cardMap.get("assigneeId") as string | null;
          const dueDateStr = cardMap.get("dueDate") as string | null;
          const dueDate = dueDateStr ? new Date(dueDateStr) : null;

          const aiComplexity = cardMap.get("aiComplexityEstimate") as string | null;
          const aiRisk = cardMap.get("aiSprintRisk") as string | null;

          const aiTagsVal = cardMap.get("aiTags");
          const aiTags = aiTagsVal instanceof Y.Array ? aiTagsVal.toArray() : (Array.isArray(aiTagsVal) ? aiTagsVal : []);

          activeCardIds.push(cardId);

          // Upsert card
          const existingCard = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
          if (existingCard.length > 0) {
            const titleChanged = existingCard[0].title !== cardTitle;
            const descChanged = existingCard[0].description !== cardDesc;

            await db.update(cards)
              .set({
                title: cardTitle,
                description: cardDesc,
                listId,
                position: cardPosition,
                assigneeId,
                dueDate,
                aiComplexityEstimate: aiComplexity,
                aiSprintRisk: aiRisk,
                aiTags,
                updatedAt: new Date(),
              })
              .where(eq(cards.id, cardId));

            if ((titleChanged || descChanged) && cardTitle && !aiComplexity) {
              await queueComplexityInference(cardId, cardTitle, cardDesc);
            }
          } else {
            await db.insert(cards).values({
              id: cardId,
              title: cardTitle,
              description: cardDesc,
              listId,
              position: cardPosition,
              assigneeId,
              dueDate,
              aiComplexityEstimate: aiComplexity,
              aiSprintRisk: aiRisk,
              aiTags,
            });

            if (cardTitle && !aiComplexity) {
              await queueComplexityInference(cardId, cardTitle, cardDesc);
            }
          }
        }
      }
    }

    // Clean up deleted lists
    const dbLists = await db.select().from(lists).where(eq(lists.boardId, boardId));
    const listsToDelete = dbLists.filter((l) => !activeListIds.includes(l.id)).map((l) => l.id);
    if (listsToDelete.length > 0) {
      await db.delete(lists).where(inArray(lists.id, listsToDelete));
    }

    // Clean up deleted cards
    const activeBoardListIds = dbLists.map((l) => l.id);
    if (activeBoardListIds.length > 0) {
      const dbCards = await db.select().from(cards).where(inArray(cards.listId, activeBoardListIds));
      const cardsToDelete = dbCards.filter((c) => !activeCardIds.includes(c.id)).map((c) => c.id);
      if (cardsToDelete.length > 0) {
        await db.delete(cards).where(inArray(cards.id, cardsToDelete));
      }
    }
  } catch (error) {
    console.error(`Error in syncYjsToRelationalDB for board: ${boardId}`, error);
  }
}

// Populate Yjs from existing PostgreSQL tables if Yjs state was not saved
async function populateYjsFromDB(boardId: string, doc: Y.Doc) {
  try {
    const listsArray = doc.getArray("lists");
    // Clear array
    while (listsArray.length > 0) {
      listsArray.delete(0);
    }

    const dbLists = await db.select().from(lists).where(eq(lists.boardId, boardId)).orderBy(lists.position);

    for (const list of dbLists) {
      const listMap = new Y.Map();
      listMap.set("id", list.id);
      listMap.set("name", list.name);
      listMap.set("position", list.position);

      const cardsArray = new Y.Array();
      const dbCards = await db.select().from(cards).where(eq(cards.listId, list.id)).orderBy(cards.position);

      for (const card of dbCards) {
        const cardMap = new Y.Map();
        cardMap.set("id", card.id);

        const titleText = new Y.Text();
        titleText.insert(0, card.title);
        cardMap.set("title", titleText);

        const descText = new Y.Text();
        descText.insert(0, card.description || "");
        cardMap.set("description", descText);

        cardMap.set("position", card.position);
        cardMap.set("assigneeId", card.assigneeId);
        cardMap.set("dueDate", card.dueDate ? card.dueDate.toISOString() : null);
        cardMap.set("aiComplexityEstimate", card.aiComplexityEstimate);
        cardMap.set("aiSprintRisk", card.aiSprintRisk);

        const tagsArray = new Y.Array();
        if (card.aiTags && card.aiTags.length > 0) {
          tagsArray.insert(0, card.aiTags);
        }
        cardMap.set("aiTags", tagsArray);

        cardsArray.push([cardMap]);
      }

      listMap.set("cards", cardsArray);
      listsArray.push([listMap]);
    }
    console.log(`Populated Yjs document from DB for board: ${boardId}`);
  } catch (error) {
    console.error(`Error in populateYjsFromDB for board: ${boardId}`, error);
  }
}

// Retrieves or creates a room document and configures database listeners
async function getOrCreateDoc(boardId: string): Promise<Y.Doc> {
  let doc = docs.get(boardId);
  if (doc) return doc;

  // Let y-websocket manage the document creation
  // We will intercept it or initialize it from DB first
  const newDoc = new WSSharedDoc(boardId);
  docs.set(boardId, newDoc);

  try {
    const savedState = await db.select().from(boardStates).where(eq(boardStates.boardId, boardId)).limit(1);
    if (savedState.length > 0) {
      const buffer = Buffer.from(savedState[0].yjsState, "base64");
      Y.applyUpdate(newDoc, buffer);
      console.log(`Loaded saved Yjs state from DB for board: ${boardId}`);
    } else {
      // Reconstruct from tables
      await populateYjsFromDB(boardId, newDoc);
    }
  } catch (error) {
    console.error(`Failed to load board state for board: ${boardId}`, error);
  }

  // Setup auto-save listener
  let debounceTimeout: NodeJS.Timeout | null = null;
  newDoc.on("update", () => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      try {
        const stateVector = Y.encodeStateAsUpdate(newDoc);
        const base64State = Buffer.from(stateVector).toString("base64");

        const existing = await db.select().from(boardStates).where(eq(boardStates.boardId, boardId)).limit(1);
        if (existing.length > 0) {
          await db.update(boardStates)
            .set({ yjsState: base64State, updatedAt: new Date() })
            .where(eq(boardStates.boardId, boardId));
        } else {
          await db.insert(boardStates).values({
            boardId,
            yjsState: base64State,
          });
        }
        console.log(`Persisted Yjs state to DB for board: ${boardId}`);

        // Sync to relational tables
        await syncYjsToRelationalDB(boardId, newDoc);
      } catch (err) {
        console.error(`Failed to auto-save board state for board: ${boardId}`, err);
      }
    }, 2000);
  });

  return newDoc;
}

export function initWebSocketServer(wss: WebSocketServer) {
  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      const match = pathname.match(/^\/ws\/board\/([^\/]+)$/);
      if (!match) {
        ws.close(4000, "Invalid connection path");
        return;
      }

      const boardId = match[1];

      // Ensure the room document is loaded and configured before y-websocket handles it
      await getOrCreateDoc(boardId);

      setupWSConnection(ws, req, {
        docName: boardId,
        gc: true,
      });

      console.log(`Client connected to real-time board: ${boardId}`);
    } catch (err) {
      console.error("WS Connection error:", err);
      ws.close(4500, "Internal server error");
    }
  });
}

export function addYjsCard(
  boardId: string,
  listId: string,
  card: { id: string; title: string; description: string }
) {
  const doc = docs.get(boardId);
  if (!doc) return;

  const listsArray = doc.getArray("lists");
  doc.transact(() => {
    for (let i = 0; i < listsArray.length; i++) {
      const listMap = listsArray.get(i);
      if (listMap instanceof Y.Map && listMap.get("id") === listId) {
        const cardsArray = listMap.get("cards") as Y.Array<any>;

        const cardMap = new Y.Map();
        cardMap.set("id", card.id);

        const titleText = new Y.Text();
        titleText.insert(0, card.title);
        cardMap.set("title", titleText);

        const descText = new Y.Text();
        descText.insert(0, card.description);
        cardMap.set("description", descText);

        cardMap.set("position", cardsArray.length);
        cardMap.set("assigneeId", null);
        cardMap.set("dueDate", null);
        cardMap.set("aiComplexityEstimate", null);
        cardMap.set("aiSprintRisk", null);
        cardMap.set("aiTags", new Y.Array());

        cardsArray.push([cardMap]);
        break;
      }
    }
  });
  console.log(`Injected card ${card.id} into Yjs doc for board ${boardId}`);
}
