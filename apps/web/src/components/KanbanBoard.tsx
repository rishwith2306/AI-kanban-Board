"use client";

import React, { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useRealtimeBoard, Card, List } from "../hooks/useRealtimeBoard";
import { Plus, X, AlignLeft, Calendar, User, Eye, Wifi, WifiOff, Trash2 } from "lucide-react";

interface KanbanCardProps {
  card: Card;
  index: number;
  listId: string;
  onCardClick: (card: Card, listId: string) => void;
}

const KanbanCard = React.memo(
  ({ card, index, listId, onCardClick }: KanbanCardProps) => {
    return (
      <Draggable key={card.id} draggableId={card.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onClick={() => onCardClick(card, listId)}
            className={`p-4 rounded-lg border border-slate-800 bg-slate-900 hover:border-zinc-500/50 hover:bg-slate-900/80 transition-all cursor-grab active:cursor-grabbing shadow-sm flex flex-col gap-2 ${
              snapshot.isDragging ? "shadow-2xl border-zinc-400 rotate-1 bg-slate-850" : ""
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <span className="text-sm font-semibold text-slate-200 line-clamp-2">
                {card.title || <span className="text-slate-600 italic">Untitled Task</span>}
              </span>
              <Eye className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
            </div>

            {card.description && (
              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                {card.description}
              </p>
            )}

            {/* Tags / Metadata */}
            {(card.dueDate || card.aiComplexityEstimate || card.aiTags?.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-800/40">
                {card.aiComplexityEstimate && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-300 border border-zinc-500/20">
                    {card.aiComplexityEstimate}
                  </span>
                )}
                {card.dueDate && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" />
                    {new Date(card.dueDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
                {card.aiTags?.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-950 text-zinc-350"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Draggable>
    );
  },
  (prev, next) => {
    return (
      prev.index === next.index &&
      prev.listId === next.listId &&
      prev.onCardClick === next.onCardClick &&
      prev.card.id === next.card.id &&
      prev.card.title === next.card.title &&
      prev.card.description === next.card.description &&
      prev.card.position === next.card.position &&
      prev.card.assigneeId === next.card.assigneeId &&
      prev.card.dueDate === next.card.dueDate &&
      prev.card.aiComplexityEstimate === next.card.aiComplexityEstimate &&
      prev.card.aiSprintRisk === next.card.aiSprintRisk &&
      prev.card.aiTags.length === next.card.aiTags.length &&
      prev.card.aiTags.every((t, i) => t === next.card.aiTags[i])
    );
  }
);
KanbanCard.displayName = "KanbanCard";

interface CardCreatorProps {
  listId: string;
  onAddCard: (listId: string, title: string) => void;
}

const CardCreator = React.memo(({ listId, onAddCard }: CardCreatorProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddCard(listId, trimmed);
    setTitle("");
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Enter task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") setIsAdding(false);
          }}
          className="w-full text-xs bg-slate-950 text-white border border-slate-850 rounded p-2 focus:outline-none focus:border-zinc-400"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setIsAdding(false)}
            className="p-1 px-2.5 text-xs text-slate-400 hover:text-white rounded transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="p-1 px-3 text-xs bg-zinc-200 hover:bg-white text-black rounded font-medium transition"
          >
            Add Card
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className="w-full text-xs text-slate-400 hover:text-white hover:bg-slate-850/50 flex items-center gap-1.5 p-1.5 rounded transition justify-center"
    >
      <Plus className="w-3.5 h-3.5" /> Add Task Card
    </button>
  );
});
CardCreator.displayName = "CardCreator";

interface KanbanListProps {
  list: List;
  onCardClick: (card: Card, listId: string) => void;
  onAddCard: (listId: string, title: string) => void;
  onDeleteList: (listId: string) => void;
}

const KanbanList = React.memo(
  ({ list, onCardClick, onAddCard, onDeleteList }: KanbanListProps) => {
    const isMandatory = ["todo", "in progress", "done"].includes(list.name.toLowerCase());

    return (
      <div className="w-72 bg-slate-900/40 border border-slate-850 rounded-xl flex flex-col max-h-[calc(100vh-200px)] shadow-lg">
        {/* List Header */}
        <div className="p-3.5 flex justify-between items-center border-b border-slate-850/60 bg-slate-900/60 rounded-t-xl gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-bold text-slate-200 truncate">{list.name}</span>
            {isMandatory && (
              <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-slate-800/80 text-zinc-400 border border-slate-700 rounded uppercase tracking-wider" title="Mandatory Core Column">
                Core
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-mono">
              {list.cards.length}
            </span>
            {!isMandatory && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete additional column "${list.name}" and its tasks?`)) {
                    onDeleteList(list.id);
                  }
                }}
                className="p-1 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
                title="Delete this custom column"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Cards Container */}
        <Droppable droppableId={list.id} type="CARD">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 overflow-y-auto p-3 space-y-3 min-h-[50px] transition-colors ${
                snapshot.isDraggingOver ? "bg-zinc-800/10" : ""
              }`}
            >
              {list.cards.map((card, index) => (
                <KanbanCard
                  key={card.id}
                  card={card}
                  index={index}
                  listId={list.id}
                  onCardClick={onCardClick}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {/* List Footer - Inline Card Creation */}
        <div className="p-3 bg-slate-900/20 rounded-b-xl border-t border-slate-850/40">
          <CardCreator listId={list.id} onAddCard={onAddCard} />
        </div>
      </div>
    );
  },
  (prev, next) => {
    if (
      prev.list.id !== next.list.id ||
      prev.list.name !== next.list.name ||
      prev.list.position !== next.list.position ||
      prev.list.cards.length !== next.list.cards.length ||
      prev.onCardClick !== next.onCardClick ||
      prev.onAddCard !== next.onAddCard ||
      prev.onDeleteList !== next.onDeleteList
    ) {
      return false;
    }
    // Check if every card is identical
    for (let i = 0; i < prev.list.cards.length; i++) {
      const c1 = prev.list.cards[i];
      const c2 = next.list.cards[i];
      if (
        c1.id !== c2.id ||
        c1.title !== c2.title ||
        c1.description !== c2.description ||
        c1.position !== c2.position ||
        c1.assigneeId !== c2.assigneeId ||
        c1.dueDate !== c2.dueDate ||
        c1.aiComplexityEstimate !== c2.aiComplexityEstimate ||
        c1.aiSprintRisk !== c2.aiSprintRisk ||
        c1.aiTags.length !== c2.aiTags.length ||
        !c1.aiTags.every((t, idx) => t === c2.aiTags[idx])
      ) {
        return false;
      }
    }
    return true;
  }
);
KanbanList.displayName = "KanbanList";

interface ListCreatorProps {
  onAddList: (name: string) => void;
}

const ListCreator = React.memo(({ onAddList }: ListCreatorProps) => {
  const [val, setVal] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;
    onAddList(val.trim());
    setVal("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-72 shrink-0 bg-slate-900/20 border border-dashed border-slate-800 rounded-xl p-4 flex flex-col gap-3"
    >
      <input
        type="text"
        placeholder="Add new list..."
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-full bg-slate-950 text-slate-200 border border-slate-850 rounded-lg p-2.5 text-sm focus:outline-none focus:border-zinc-400"
      />
      <button
        type="submit"
        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs rounded-lg border border-slate-800 font-medium transition flex items-center gap-1.5 justify-center"
      >
        <Plus className="w-4 h-4" /> Create Column
      </button>
    </form>
  );
});
ListCreator.displayName = "ListCreator";

interface KanbanGridProps {
  lists: List[];
  onCardClick: (card: Card, listId: string) => void;
  onAddCard: (listId: string, title: string) => void;
  onAddList: (name: string) => void;
  onDeleteList: (listId: string) => void;
  onDragEnd: (result: DropResult) => void;
}

const KanbanGrid = React.memo(({ lists, onCardClick, onAddCard, onAddList, onDeleteList, onDragEnd }: KanbanGridProps) => {
  return (
    <div className="flex-1 relative overflow-x-auto overflow-y-hidden p-6 bg-transparent">
      {/* Board Columns Grid Content */}
      <div className="relative z-10 flex gap-6 items-start min-h-full">
        <DragDropContext onDragEnd={onDragEnd}>
          {lists.map((list) => (
            <KanbanList
              key={list.id}
              list={list}
              onCardClick={onCardClick}
              onAddCard={onAddCard}
              onDeleteList={onDeleteList}
            />
          ))}
        </DragDropContext>

        <ListCreator onAddList={onAddList} />
      </div>
    </div>
  );
});
KanbanGrid.displayName = "KanbanGrid";

interface KanbanBoardProps {
  boardId: string;
}

export function KanbanBoard({ boardId }: KanbanBoardProps) {
  const {
    lists,
    collaborators,
    isConnected,
    userName,
    updateCursor,
    addList,
    deleteList,
    addCard,
    moveCard,
    updateCardField,
    clearAllCards,
    clearCustomLists,
  } = useRealtimeBoard(boardId);

  // Check if current user is Admin
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("collab-pm-user");
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (user.role === "Admin") setIsAdmin(true);
      } catch (e) {}
    }
  }, []);

  // Selected Card for Detail Modal
  const [selectedCard, setSelectedCard] = useState<{ card: Card; listId: string } | null>(null);

  // Track mouse move for collaborative cursors
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      updateCursor(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [updateCursor]);

  // Handle Drag End event
  const onDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    moveCard(draggableId, source.droppableId, destination.droppableId, destination.index);
  }, [moveCard]);

  const handleCardClick = useCallback((card: Card, listId: string) => {
    setSelectedCard({ card, listId });
  }, []);

  return (
    <div className="flex flex-col flex-1 h-full select-none">
      {/* Cursors Overlay */}
      {collaborators.map((collab) => {
        if (!collab.cursor) return null;
        return (
          <div
            key={collab.clientId}
            className="pointer-events-none fixed z-[9999] transition-all duration-75"
            style={{
              left: `${collab.cursor.x}px`,
              top: `${collab.cursor.y}px`,
            }}
          >
            <svg
              className="w-5 h-5 -mt-1 -ml-1 drop-shadow"
              viewBox="0 0 24 24"
              fill={collab.color}
            >
              <path d="M4.5 3V17L9 12.5H16.5L4.5 3Z" />
            </svg>
            <div
              className="ml-4 mt-2 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-md whitespace-nowrap"
              style={{ backgroundColor: collab.color }}
            >
              {collab.name}
            </div>
          </div>
        );
      })}

      {/* Board Headers / Controls */}
      <div className="flex items-center justify-between py-4 px-6 border-b border-slate-800/80 bg-black/40 backdrop-blur relative z-20">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Board Workspace</h2>
          <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            isConnected 
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}>
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                Live Syncing
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                Reconnecting...
              </>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 ml-2">
              <button
                type="button"
                onClick={() => {
                  if (confirm("⚠️ Admin Action: Are you sure you want to clear ALL task cards across all columns?")) {
                    clearAllCards();
                  }
                }}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition shadow-md shadow-rose-900/20 flex items-center gap-1.5 cursor-pointer"
                title="Admin: Clear all tasks on the board"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Tasks
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm("⚠️ Admin Action: Delete all user-created custom columns, keeping mandatory columns (Todo, In Progress, Done)?")) {
                    clearCustomLists();
                  }
                }}
                className="px-3 py-1 bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 text-xs font-bold rounded-lg transition shadow-md flex items-center gap-1.5 cursor-pointer"
                title="Admin: Remove all user-created additional columns"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear Custom Columns
              </button>
            </div>
          )}
        </div>

        {/* Presence Indicators */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 mr-2">
            Playing as: <span className="font-mono text-zinc-400 font-semibold">{userName}</span>
          </span>
          <div className="flex -space-x-1.5 overflow-hidden">
            {collaborators.map((c) => (
              <div
                key={c.clientId}
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white border-2 border-slate-950 shadow-inner"
                style={{ backgroundColor: c.color }}
                title={c.name}
              >
                {c.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kanban Grid */}
      <KanbanGrid
        lists={lists}
        onCardClick={handleCardClick}
        onAddCard={addCard}
        onAddList={addList}
        onDeleteList={deleteList}
        onDragEnd={onDragEnd}
      />

      {/* Card Detail Modal */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedCard(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white rounded transition p-1 hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-6">
              {/* Editable Title */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Task Title
                </label>
                <input
                  type="text"
                  value={selectedCard.card.title}
                  onChange={(e) => {
                    updateCardField(selectedCard.listId, selectedCard.card.id, "title", e.target.value);
                    setSelectedCard((prev) => prev ? { ...prev, card: { ...prev.card, title: e.target.value } } : null);
                  }}
                  className="w-full bg-transparent text-lg font-bold text-white border-b border-transparent hover:border-slate-800 focus:border-zinc-400 focus:outline-none pb-1"
                />
              </div>

              {/* Editable Description */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <AlignLeft className="w-4 h-4" />
                  Description
                </div>
                <textarea
                  value={selectedCard.card.description}
                  onChange={(e) => {
                    updateCardField(selectedCard.listId, selectedCard.card.id, "description", e.target.value);
                    setSelectedCard((prev) => prev ? { ...prev, card: { ...prev.card, description: e.target.value } } : null);
                  }}
                  placeholder="Add a detailed description for this task..."
                  rows={4}
                  className="w-full bg-slate-950 text-slate-200 border border-slate-850 rounded-lg p-3 text-sm focus:outline-none focus:border-zinc-400 resize-none leading-relaxed"
                />
              </div>

              {/* AI Assistant Tags Panel */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/60">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    <User className="w-3 h-3" />
                    Complexity Score
                  </div>
                  <div className="text-sm font-semibold text-slate-300 font-mono bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-850 w-fit">
                    {selectedCard.card.aiComplexityEstimate || "Not yet analyzed"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    <Calendar className="w-3 h-3" />
                    Due Date
                  </div>
                  <div className="text-sm font-semibold text-slate-300 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-850 w-fit">
                    {selectedCard.card.dueDate 
                      ? new Date(selectedCard.card.dueDate).toLocaleDateString() 
                      : "No deadline"}
                  </div>
                </div>
              </div>

              {selectedCard.card.aiSprintRisk && (
                <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                  <span className="font-bold">Sprint Risk Warning: </span>
                  {selectedCard.card.aiSprintRisk}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

