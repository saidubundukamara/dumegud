import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MIGRATOR or DATABASE_URL must be set to run drizzle-kit");

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  dbCredentials: { url },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
