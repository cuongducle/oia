import { pgTable, text, integer, bigint, boolean, jsonb, timestamp, serial } from "drizzle-orm/pg-core";

/** M0: draft schema — migrations will be generated with `pnpm drizzle-kit generate`. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  sessionId: bigint("session_id", { mode: "number" }).notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  renderData: jsonb("render_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").default("Untitled project"),
  scene: jsonb("scene"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull(), // image | document | generated
  createdAt: timestamp("created_at").defaultNow(),
});

export const brandKits = pgTable("brand_kits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").default("Untitled"),
  guidance: text("guidance"),
  logos: jsonb("logos").default([]),
  colors: jsonb("colors").default([]),
  fonts: jsonb("fonts").default([]),
  applyByDefault: boolean("apply_by_default").default(false),
});

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  name: text("name").notNull(),
  scene: jsonb("scene").notNull(),
  featured: boolean("featured").default(false),
  tipCredits: integer("tip_credits").default(0),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  hashedKey: text("hashed_key").notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usageEvents = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(), // image | llm
  costUsd: integer("cost_usd_micros"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow(),
});
