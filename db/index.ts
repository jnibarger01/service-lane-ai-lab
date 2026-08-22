import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type ServiceLaneRuntime = typeof globalThis & {
  __SERVICE_LANE_DB__?: D1Database;
};

export function getDb() {
  const d1 = getD1();
  if (!d1) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(d1, { schema });
}

export function getD1(): D1Database {
  const d1 = (globalThis as ServiceLaneRuntime).__SERVICE_LANE_DB__;
  if (!d1) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return d1;
}
