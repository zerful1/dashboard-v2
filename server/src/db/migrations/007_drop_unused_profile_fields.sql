-- Settings redesign (part 8): nothing in the client or the server read these.
-- Timezone stays: Food's copy-a-day moves entries by local days in it.
ALTER TABLE profiles
  DROP COLUMN display_name,
  DROP COLUMN avatar_path,
  DROP COLUMN units;
