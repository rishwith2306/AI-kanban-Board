import type { Config } from "drizzle-kit";

export default {
  schema: "./schema.ts",
  out: "./migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || "postgres://postgres:varanasi@localhost:5433/collab-pm",
  },
} satisfies Config;
