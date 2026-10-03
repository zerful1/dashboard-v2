import { defaultShouldDehydrateQuery, type Query } from "@tanstack/react-query";

/** What TanStack would persist by default, minus queries that opt out with meta.persist = false. */
export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && query.meta?.persist !== false;
}
