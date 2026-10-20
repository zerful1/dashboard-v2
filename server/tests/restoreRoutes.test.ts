import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import request from "supertest";
import type { ExportFile } from "@dashboard/shared";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { exportUserData } from "../src/repositories/export";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

const COULDNT = "This file couldn't be restored. Nothing was changed.";
const VERSION = "This download is from a different version of the app.";

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who).expect(201);
  return { agent, id: (await findUserByEmail(who.email))!.id };
}

/** Alice's download, taken while she had one weigh-in, which is then deleted. */
async function aliceMissingAWeighIn() {
  const a = await signedIn(alice);
  await a.agent.post("/api/weight").send({ date: "2026-10-01", weight_kg: 79.4 }).expect(201);
  const file = await exportUserData(a.id);
  await pool.query(`DELETE FROM ${T.bodyWeight} WHERE user_id = $1`, [a.id]);
  return { ...a, file };
}

const weighIns = async (userId: string) =>
  (await pool.query(`SELECT count(*)::int AS n FROM ${T.bodyWeight} WHERE user_id = $1`, [userId])).rows[0].n as number;

const gz = (file: unknown) => gzipSync(JSON.stringify(file));

function send(agent: ReturnType<typeof request.agent>, path: string, body: Buffer | string, gzipped = true) {
  // serialize: superagent would otherwise JSON-encode a Buffer sent as application/json.
  const req = agent.post(path).set("Content-Type", "application/json").serialize((b: unknown) => b as string);
  if (gzipped) req.set("Content-Encoding", "gzip");
  return req.send(body);
}

describe("POST /api/restore/preview and /api/restore", () => {
  it("previews without writing, then restores", async () => {
    const a = await aliceMissingAWeighIn();
    const preview = await send(a.agent, "/api/restore/preview", gz(a.file)).expect(200);
    expect(preview.body.added.body_weight).toBe(1);
    expect(await weighIns(a.id)).toBe(0);

    const done = await send(a.agent, "/api/restore", gz(a.file)).expect(200);
    expect(done.body.added).toEqual(preview.body.added);
    expect(await weighIns(a.id)).toBe(1);
  });

  it("takes a plain JSON body too", async () => {
    const a = await aliceMissingAWeighIn();
    await send(a.agent, "/api/restore", JSON.stringify(a.file), false).expect(200);
    expect(await weighIns(a.id)).toBe(1);
  });

  // The global parser stops at 1 MB; a long-kept download passes that once unpacked.
  it("restores a file over 1 MB once unpacked", async () => {
    const a = await aliceMissingAWeighIn();
    const big = { ...a.file, padding: ["x".repeat(1_500_000)] };
    await send(a.agent, "/api/restore", gz(big)).expect(200);
    expect(await weighIns(a.id)).toBe(1);
  });

  // Downloads made before housekeeping PR 1 carry these, empty.
  it("ignores an old download's media keys", async () => {
    const a = await aliceMissingAWeighIn();
    const old = { ...a.file, tables: { ...a.file.tables, media: [], media_seasons: [], progress_photos: [] } };
    const res = await send(a.agent, "/api/restore", gz(old)).expect(200);
    expect(res.body.added.body_weight).toBe(1);
  });

  it("refuses another account's file", async () => {
    const a = await aliceMissingAWeighIn();
    const b = await signedIn(bob);
    const res = await send(b.agent, "/api/restore", gz(a.file)).expect(400);
    expect(res.body.message).toBe("This download belongs to another account.");
    expect(await weighIns(b.id)).toBe(0);
  });

  it("matches the email ignoring case", async () => {
    const a = await aliceMissingAWeighIn();
    const shouty: ExportFile = { ...a.file, account: { ...a.file.account, email: alice.email.toUpperCase() } };
    await send(a.agent, "/api/restore", gz(shouty)).expect(200);
  });

  it("refuses a different version", async () => {
    const a = await aliceMissingAWeighIn();
    const res = await send(a.agent, "/api/restore", gz({ ...a.file, version: 2 })).expect(400);
    expect(res.body.message).toBe(VERSION);
  });

  it("refuses a file that isn't a download", async () => {
    const a = await aliceMissingAWeighIn();
    const res = await send(a.agent, "/api/restore/preview", gz({ ...a.file, format: "x" })).expect(400);
    expect(res.body.message).toBe(COULDNT);
  });

  // The parser skips a body that isn't JSON, which then isn't "a different version".
  it("refuses a body that isn't JSON the same way", async () => {
    const a = await aliceMissingAWeighIn();
    const res = await a.agent.post("/api/restore/preview").set("Content-Type", "text/plain").send(JSON.stringify(a.file));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(COULDNT);
  });

  it("answers a bad row with nothing changed", async () => {
    const a = await aliceMissingAWeighIn();
    const bad = structuredClone(a.file);
    bad.tables.body_weight![0]!.weight_kg = 0;
    const res = await send(a.agent, "/api/restore", gz(bad)).expect(400);
    expect(res.body.message).toBe(COULDNT);
    expect(await weighIns(a.id)).toBe(0);
  });

  it("answers broken gzip the same way", async () => {
    const a = await aliceMissingAWeighIn();
    const res = await send(a.agent, "/api/restore", Buffer.from("not gzip at all")).expect(400);
    expect(res.body.message).toBe(COULDNT);
  });

  it("answers tables that aren't lists of rows the same way", async () => {
    const a = await aliceMissingAWeighIn();
    const res = await send(a.agent, "/api/restore", gz({ ...a.file, tables: { body_weight: "nope" } })).expect(400);
    expect(res.body.message).toBe(COULDNT);
  });

  it("needs a session", async () => {
    await send(request.agent(app), "/api/restore/preview", gz({})).expect(401);
  });

  it("gives the demo 403", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/demo").expect(200);
    await send(agent, "/api/restore/preview", gz({})).expect(403);
    await send(agent, "/api/restore", gz({})).expect(403);
  });
});
