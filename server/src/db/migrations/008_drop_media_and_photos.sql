-- Housekeeping (2026-10-17): media and progress photos were never built - zero
-- rows in v1 and v2. A dropping migration: it runs on production AFTER the
-- deploy that stops naming these tables (CLAUDE.md).
DROP TABLE media_seasons;
DROP TABLE media;
DROP TABLE progress_photos;
