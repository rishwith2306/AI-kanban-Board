"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export interface Card {
  id: string;
  title: string;
  description: string;
  position: number;
  assigneeId: string | null;
  dueDate: string | null;
  aiComplexityEstimate: string | null;
  aiSprintRisk: string | null;
  aiTags: string[];
}

export interface List {
  id: string;
  name: string;
  position: number;
  cards: Card[];
}

export interface Collaborator {
  clientId: number;
  name: string;
  color: string;
  cursor?: { x: number; y: number };
}

export interface AIInsightsState {
  bottlenecks: {
    columnName: string;
    count: number;
    riskLevel: "Low" | "Medium" | "High";
    likelyCause: string;
  }[];
  sprintRisk: {
    riskLevel: "Low" | "Medium" | "High";
    summary: string;
  } | null;
  assignmentSuggestions: {
    cardId: string;
    cardTitle: string;
    suggestedAssigneeId: string;
    suggestedAssigneeName: string;
    reason: string;
  }[];
  weeklyDigest: string;
  lastAuditedAt?: string;
}

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#10b981", 
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef"
];

export function useRealtimeBoard(boardId: string) {
  const [lists, setLists] = useState<List[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [userName, setUserName] = useState<string>("");

  const [aiInsights, setAiInsights] = useState<AIInsightsState>({
    bottlenecks: [],
    sprintRisk: null,
    assignmentSuggestions: [],
    weeklyDigest: "",
  });

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  // Refs for throttling mouse cursor updates
  const lastUpdateRef = useRef<number>(0);
  const throttleTimeoutRef = useRef<any>(null);

  // Initialize client user details from stored user session or fallback
  useEffect(() => {
    const stored = localStorage.getItem("collab-pm-user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.name) {
          setUserName(parsed.name);
          return;
        }
      } catch (e) {
        console.error("Failed to parse user session", e);
      }
    }
    const randomName = `User ${Math.floor(Math.random() * 1000)}`;
    setUserName(randomName);
  }, []);

  const updateState = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;

    const listsArray = doc.getArray("lists");
    const parsedLists: List[] = [];

    for (let i = 0; i < listsArray.length; i++) {
      const listMap = listsArray.get(i);
      if (!(listMap instanceof Y.Map)) continue;

      const cardsArray = listMap.get("cards");
      const parsedCards: Card[] = [];

      if (cardsArray instanceof Y.Array) {
        for (let j = 0; j < cardsArray.length; j++) {
          const cardMap = cardsArray.get(j);
          if (!(cardMap instanceof Y.Map)) continue;

          const titleText = cardMap.get("title");
          const descText = cardMap.get("description");
          const aiTagsVal = cardMap.get("aiTags");

          parsedCards.push({
            id: cardMap.get("id") as string,
            title: titleText instanceof Y.Text ? titleText.toString() : (titleText as string || ""),
            description: descText instanceof Y.Text ? descText.toString() : (descText as string || ""),
            position: cardMap.get("position") as number,
            assigneeId: cardMap.get("assigneeId") as string | null,
            dueDate: cardMap.get("dueDate") as string | null,
            aiComplexityEstimate: cardMap.get("aiComplexityEstimate") as string | null,
            aiSprintRisk: cardMap.get("aiSprintRisk") as string | null,
            aiTags: aiTagsVal instanceof Y.Array ? aiTagsVal.toArray() : (Array.isArray(aiTagsVal) ? aiTagsVal : []),
          });
        }
      }

      parsedLists.push({
        id: listMap.get("id") as string,
        name: listMap.get("name") as string,
        position: listMap.get("position") as number,
        cards: parsedCards.sort((a, b) => a.position - b.position),
      });
    }

    setLists(parsedLists.sort((a, b) => a.position - b.position));
  }, []);

  const updateInsights = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;

    const insightsMap = doc.getMap("insights");
    setAiInsights({
      bottlenecks: (insightsMap.get("bottlenecks") as any) || [],
      sprintRisk: (insightsMap.get("sprintRisk") as any) || null,
      assignmentSuggestions: (insightsMap.get("assignmentSuggestions") as any) || [],
      weeklyDigest: (insightsMap.get("weeklyDigest") as any) || "",
      lastAuditedAt: (insightsMap.get("lastAuditedAt") as any) || undefined,
    });
  }, []);

  useEffect(() => {
    if (!userName) return;

    // 1. Create Y.Doc
    const doc = new Y.Doc();
    docRef.current = doc;

    // 2. Setup Websocket Provider
    const wsUrl = "ws://localhost:4000/ws/board";
    const provider = new WebsocketProvider(wsUrl, boardId, doc);
    providerRef.current = provider;

    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    provider.awareness.setLocalStateField("user", {
      name: userName,
      color: randomColor,
    });

    provider.on("status", (event: { status: string }) => {
      setIsConnected(event.status === "connected");
    });

    // 3. Listen for Yjs Doc updates
    const handleUpdate = () => {
      updateState();
      updateInsights();
    };
    doc.on("update", handleUpdate);

    // 4. Listen for presence/awareness updates
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      const list: Collaborator[] = [];
      states.forEach((state: any, clientId: number) => {
        if (clientId === provider.awareness.clientID) return; // skip self
        if (state.user) {
          list.push({
            clientId,
            name: state.user.name,
            color: state.user.color,
            cursor: state.cursor,
          });
        }
      });
      setCollaborators(list);
    };

    provider.awareness.on("change", handleAwareness);

    // Initial state check
    updateState();
    updateInsights();

    return () => {
      doc.off("update", handleUpdate);
      provider.awareness.off("change", handleAwareness);
      provider.disconnect();
      doc.destroy();
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, [boardId, userName, updateState, updateInsights]);

  // Update cursor position in awareness with a 50ms throttle (and trailing edge)
  const updateCursor = useCallback((x: number, y: number) => {
    const provider = providerRef.current;
    if (!provider || !isConnected) return;

    const now = Date.now();
    const throttleMs = 50; // Update cursor at most every 50ms

    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = null;
    }

    if (now - lastUpdateRef.current >= throttleMs) {
      provider.awareness.setLocalStateField("cursor", { x, y });
      lastUpdateRef.current = now;
    } else {
      throttleTimeoutRef.current = setTimeout(() => {
        provider.awareness.setLocalStateField("cursor", { x, y });
        lastUpdateRef.current = Date.now();
      }, throttleMs - (now - lastUpdateRef.current));
    }
  }, [isConnected]);

  // Mutation: Add a new list
  const addList = useCallback((name: string) => {
    const doc = docRef.current;
    if (!doc) return;

    const listsArray = doc.getArray("lists");
    
    // Check if list already exists to prevent duplicate insertion
    for (let i = 0; i < listsArray.length; i++) {
      const lm = listsArray.get(i);
      if (lm instanceof Y.Map && lm.get("name") === name) return;
    }

    const listMap = new Y.Map();
    listMap.set("id", crypto.randomUUID());
    listMap.set("name", name);
    listMap.set("position", listsArray.length);
    listMap.set("cards", new Y.Array());

    listsArray.push([listMap]);
    updateState();
  }, [updateState]);

  // Mutation: Add a card to a list
  const addCard = useCallback((listId: string, title: string) => {
    const doc = docRef.current;
    if (!doc) return;

    const listsArray = doc.getArray("lists");
    for (let i = 0; i < listsArray.length; i++) {
      const listMap = listsArray.get(i);
      if (listMap instanceof Y.Map && listMap.get("id") === listId) {
        const cardsArray = listMap.get("cards") as Y.Array<Y.Map<any>>;
        const cardMap = new Y.Map();
        
        cardMap.set("id", crypto.randomUUID());
        
        const titleText = new Y.Text();
        titleText.insert(0, title);
        cardMap.set("title", titleText);

        const descText = new Y.Text();
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
    updateState();
  }, [updateState]);

  // Mutation: Move a card
  const moveCard = useCallback((
    cardId: string, 
    fromListId: string, 
    toListId: string, 
    newPosition: number
  ) => {
    const doc = docRef.current;
    if (!doc) return;

    const listsArray = doc.getArray("lists");
    let clonedCardMap: Y.Map<any> | null = null;

    doc.transact(() => {
      // 1. Find and clone the card from original list
      let found = false;
      for (let i = 0; i < listsArray.length; i++) {
        const listMap = listsArray.get(i);
        if (listMap instanceof Y.Map && listMap.get("id") === fromListId) {
          const cardsArray = listMap.get("cards") as Y.Array<Y.Map<any>>;
          for (let j = 0; j < cardsArray.length; j++) {
            const cardMap = cardsArray.get(j);
            if (cardMap instanceof Y.Map && cardMap.get("id") === cardId) {
              // Clone all card properties
              clonedCardMap = new Y.Map();
              clonedCardMap.set("id", cardMap.get("id"));
              
              const titleText = new Y.Text();
              const originalTitle = cardMap.get("title");
              titleText.insert(0, originalTitle ? originalTitle.toString() : "");
              clonedCardMap.set("title", titleText);

              const descText = new Y.Text();
              const originalDesc = cardMap.get("description");
              descText.insert(0, originalDesc ? originalDesc.toString() : "");
              clonedCardMap.set("description", descText);

              clonedCardMap.set("position", newPosition);
              clonedCardMap.set("assigneeId", cardMap.get("assigneeId"));
              clonedCardMap.set("dueDate", cardMap.get("dueDate"));
              clonedCardMap.set("aiComplexityEstimate", cardMap.get("aiComplexityEstimate"));
              clonedCardMap.set("aiSprintRisk", cardMap.get("aiSprintRisk"));

              const tagsArray = new Y.Array();
              const originalTags = cardMap.get("aiTags");
              if (originalTags instanceof Y.Array) {
                tagsArray.insert(0, originalTags.toArray());
              } else if (Array.isArray(originalTags)) {
                tagsArray.insert(0, originalTags);
              }
              clonedCardMap.set("aiTags", tagsArray);

              // Delete card from original list
              cardsArray.delete(j);
              found = true;
              break;
            }
          }
          
          if (found) {
            // Re-index remaining cards in source list
            for (let j = 0; j < cardsArray.length; j++) {
              cardsArray.get(j).set("position", j);
            }
            break;
          }
        }
      }

      // 2. Insert cloned card into target list at newPosition
      if (clonedCardMap) {
        for (let i = 0; i < listsArray.length; i++) {
          const listMap = listsArray.get(i);
          if (listMap instanceof Y.Map && listMap.get("id") === toListId) {
            const cardsArray = listMap.get("cards") as Y.Array<Y.Map<any>>;
            
            cardsArray.insert(newPosition, [clonedCardMap]);

            // Re-index all cards in target list
            for (let j = 0; j < cardsArray.length; j++) {
              cardsArray.get(j).set("position", j);
            }
            break;
          }
        }
      }
    });

    updateState();
  }, [updateState]);

  // Mutation: Update card fields (title, desc)
  const updateCardField = useCallback((
    listId: string,
    cardId: string,
    field: "title" | "description",
    newValue: string
  ) => {
    const doc = docRef.current;
    if (!doc) return;

    const listsArray = doc.getArray("lists");
    for (let i = 0; i < listsArray.length; i++) {
      const listMap = listsArray.get(i);
      if (listMap instanceof Y.Map && listMap.get("id") === listId) {
        const cardsArray = listMap.get("cards") as Y.Array<Y.Map<any>>;
        for (let j = 0; j < cardsArray.length; j++) {
          const cardMap = cardsArray.get(j);
          if (cardMap instanceof Y.Map && cardMap.get("id") === cardId) {
            const yText = cardMap.get(field);
            if (yText instanceof Y.Text) {
              if (yText.toString() !== newValue) {
                doc.transact(() => {
                  yText.delete(0, yText.length);
                  yText.insert(0, newValue);
                });
              }
            }
            break;
          }
        }
        break;
      }
    }
    updateState();
  }, [updateState]);

  // Mutation: Accept assignee suggestions
  const acceptAssignment = useCallback((cardId: string, assigneeId: string) => {
    const doc = docRef.current;
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
                cardMap.set("assigneeId", assigneeId);

                // Update local suggestions array inside Yjs insights map
                const insightsMap = doc.getMap("insights");
                const currentSuggestions = (insightsMap.get("assignmentSuggestions") as any) || [];
                const updatedSuggestions = currentSuggestions.filter(
                  (s: any) => s.cardId !== cardId
                );
                insightsMap.set("assignmentSuggestions", updatedSuggestions);
                break;
              }
            }
          }
        }
      }
    });
    updateState();
    updateInsights();
  }, [updateState, updateInsights]);

  // Admin Mutation: Clear all task cards from all lists
  const clearAllCards = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;

    doc.transact(() => {
      const listsArray = doc.getArray("lists");
      for (let i = 0; i < listsArray.length; i++) {
        const listMap = listsArray.get(i);
        if (listMap instanceof Y.Map) {
          const cardsArray = listMap.get("cards") as Y.Array<Y.Map<any>>;
          if (cardsArray) {
            cardsArray.delete(0, cardsArray.length);
          }
        }
      }
    });
    updateState();
  }, [updateState]);

  // Mutation: Delete an individual list
  const deleteList = useCallback((listId: string) => {
    const doc = docRef.current;
    if (!doc) return;

    doc.transact(() => {
      const listsArray = doc.getArray("lists");
      for (let i = 0; i < listsArray.length; i++) {
        const listMap = listsArray.get(i);
        if (listMap instanceof Y.Map && listMap.get("id") === listId) {
          listsArray.delete(i);
          break;
        }
      }
    });
    updateState();
  }, [updateState]);

  // Admin Mutation: Clear all custom additional lists (keeping mandatory: Todo, In Progress, Done)
  const clearCustomLists = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;

    const mandatory = ["todo", "in progress", "done"];
    doc.transact(() => {
      const listsArray = doc.getArray("lists");
      for (let i = listsArray.length - 1; i >= 0; i--) {
        const listMap = listsArray.get(i);
        if (listMap instanceof Y.Map) {
          const name = String(listMap.get("name") || "").toLowerCase();
          if (!mandatory.includes(name)) {
            listsArray.delete(i);
          }
        }
      }
    });
    updateState();
  }, [updateState]);

  return {
    lists,
    collaborators,
    isConnected,
    userName,
    aiInsights,
    updateCursor,
    addList,
    deleteList,
    addCard,
    moveCard,
    updateCardField,
    acceptAssignment,
    clearAllCards,
    clearCustomLists,
  };
}
