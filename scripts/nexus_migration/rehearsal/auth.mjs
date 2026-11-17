import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { toNodeHandler } from "better-auth/node";
import pg from "pg";

const {
  NEXUS_REHEARSAL_ROOT, NEXUS_REHEARSAL_AUTH_URL,
  NEXUS_REHEARSAL_PUBLIC_ORIGIN, BETTER_AUTH_SECRET,
} = process.env;
const base = new URL(NEXUS_REHEARSAL_AUTH_URL);
const publicOrigin = NEXUS_REHEARSAL_PUBLIC_ORIGIN
  ? new URL(NEXUS_REHEARSAL_PUBLIC_ORIGIN)
  : base;
if (
  !NEXUS_REHEARSAL_ROOT ||
  process.env.PGHOST !== join(NEXUS_REHEARSAL_ROOT, "socket") ||
  process.env.PGDATABASE !== "nexus_rehearsal" ||
  base.protocol !== "http:" ||
  base.hostname !== "127.0.0.1" ||
  !base.port ||
  publicOrigin.protocol !== "http:" ||
  publicOrigin.hostname !== "127.0.0.1" ||
  !BETTER_AUTH_SECRET
) {
  throw new Error("A private Nexus rehearsal workspace is required");
}

const database = new pg.Pool({
  user: "nexus_rehearsal_auth",
  options: "-c search_path=auth",
  max: 2,
  connectionTimeoutMillis: 2000,
});

const auth = betterAuth({
  appName: "Nexus Rehearsal",
  baseURL: base.origin,
  trustedOrigins: [publicOrigin.origin],
  database,
  secret: BETTER_AUTH_SECRET,
  advanced: { database: { generateId: "uuid" } },
  user: { modelName: "users" },
  session: { cookieCache: { enabled: false } },
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ token }) {
      // The local outbox proves link generation without contacting an email service.
      await writeFile(join(NEXUS_REHEARSAL_ROOT, "reset-token"), token, {
        mode: 0o600,
        flag: "wx",
      });
    },
  },
});

if (process.argv[2] === "--migrate") {
  try {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  } finally {
    await database.end();
  }
} else {
  const server = createServer(toNodeHandler(auth));
  server.listen(Number(base.port), "127.0.0.1");
  process.on("SIGTERM", () => {
    server.close(async () => {
      await database.end();
    });
  });
}
