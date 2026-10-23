import { describe, it, expect } from "vitest";
import { X509Certificate } from "node:crypto";
import { sslFor, SUPABASE_ROOT_CA } from "../src/db/ssl";
import { pool } from "../src/db/pool";
import { config } from "../src/config";

/**
 * node-pg connects in plaintext unless it is handed `ssl`, and nothing fails when
 * it isn't: every query still works, readable on the wire. So the choice is pinned
 * here rather than trusted to the env URL.
 */
describe("sslFor", () => {
  it("verifies a Supabase pooler against Supabase's CA", () => {
    const ssl = sslFor("postgresql://postgres.ref:pw@aws-1-eu-west-2.pooler.supabase.com:6543/postgres");
    expect(ssl).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true });
  });

  it("covers the direct supabase.co host too", () => {
    expect(sslFor("postgresql://postgres:pw@db.ref.supabase.co:5432/postgres")?.rejectUnauthorized).toBe(true);
  });

  it("leaves a local Postgres alone", () => {
    // The positive complement: TLS for every host would pass the tests above and
    // break the README's plain local setup.
    expect(sslFor("postgresql://postgres:postgres@localhost:5432/dashboard")).toBeUndefined();
  });

  it("is not fooled by a host that merely contains supabase", () => {
    expect(sslFor("postgresql://u:p@supabase.com.evil.example:5432/db")).toBeUndefined();
  });

  it("embeds a parseable certificate that is Supabase's root", () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA);
    expect(cert.subject).toContain("CN=Supabase Root 2021 CA");
    expect(cert.ca).toBe(true);
  });
});

describe("the runtime pool", () => {
  it("is built with the TLS its URL calls for", () => {
    expect(pool.options.ssl).toEqual(sslFor(config.DATABASE_URL));
  });
});
