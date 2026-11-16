-- Cardio lists in the order it was logged; nullable so older export files still restore.
ALTER TABLE cardio_entries ADD COLUMN created_at timestamptz DEFAULT now();
