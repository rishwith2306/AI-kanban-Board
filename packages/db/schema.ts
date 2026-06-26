import { pgTable, text, timestamp, uuid, integer, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const boards = pgTable("boards", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sprintStartDate: timestamp("sprint_start_date"),
  sprintEndDate: timestamp("sprint_end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lists = pgTable("lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  listId: uuid("list_id")
    .notNull()
    .references(() => lists.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date"),
  // AI fields
  aiComplexityEstimate: text("ai_complexity_estimate"), // e.g. "Medium", "5 pts"
  aiSprintRisk: text("ai_sprint_risk"), // e.g. "High risk of delay"
  aiTags: jsonb("ai_tags").$type<string[]>(), // Array of auto-generated tags
  // Standard timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const boardStates = pgTable("board_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id")
    .notNull()
    .unique()
    .references(() => boards.id, { onDelete: "cascade" }),
  yjsState: text("yjs_state").notNull(), // Base64 encoded binary Yjs state
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const weeklyDigests = pgTable("weekly_digests", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  markdownContent: text("markdown_content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  boardId: uuid("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  bottlenecks: jsonb("bottlenecks"), // JSON of bottleneck analysis
  sprintRisk: text("sprint_risk"), // Sprint risk summary text
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
  assignedCards: many(cards),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  boards: many(boards),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [boards.workspaceId],
    references: [workspaces.id],
  }),
  lists: many(lists),
  weeklyDigests: many(weeklyDigests),
  aiInsights: many(aiInsights),
}));

export const weeklyDigestsRelations = relations(weeklyDigests, ({ one }) => ({
  board: one(boards, {
    fields: [weeklyDigests.boardId],
    references: [boards.id],
  }),
}));

export const aiInsightsRelations = relations(aiInsights, ({ one }) => ({
  board: one(boards, {
    fields: [aiInsights.boardId],
    references: [boards.id],
  }),
}));

export const listsRelations = relations(lists, ({ one, many }) => ({
  board: one(boards, {
    fields: [lists.boardId],
    references: [boards.id],
  }),
  cards: many(cards),
}));

export const cardsRelations = relations(cards, ({ one }) => ({
  list: one(lists, {
    fields: [cards.listId],
    references: [lists.id],
  }),
  assignee: one(users, {
    fields: [cards.assigneeId],
    references: [users.id],
  }),
}));
