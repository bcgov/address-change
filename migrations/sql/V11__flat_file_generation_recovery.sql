ALTER TABLE address_change.flat_file_batch
  ADD COLUMN batch_sequence integer,
  ADD COLUMN generation_attempt_count integer NOT NULL DEFAULT 0 CHECK (generation_attempt_count >= 0),
  ADD COLUMN generation_claimed_at timestamptz,
  ADD COLUMN generation_last_error text;

WITH numbered AS (
  SELECT batch_id,
         row_number() OVER (
           PARTITION BY partner_id, file_date
           ORDER BY generated_at NULLS LAST, created_at, batch_id
         )::integer AS sequence
  FROM address_change.flat_file_batch
)
UPDATE address_change.flat_file_batch batch
SET batch_sequence = numbered.sequence
FROM numbered
WHERE numbered.batch_id = batch.batch_id;

ALTER TABLE address_change.flat_file_batch
  ALTER COLUMN batch_sequence SET NOT NULL,
  ALTER COLUMN batch_sequence SET DEFAULT 1,
  ADD CONSTRAINT flat_file_batch_sequence_positive CHECK (batch_sequence > 0),
  ADD CONSTRAINT flat_file_batch_partner_day_sequence_unique
    UNIQUE (partner_id, file_date, batch_sequence);

COMMENT ON COLUMN address_change.flat_file_batch.batch_sequence IS
  'Daily sequence for the partner file name; supports multiple files per partner per day.';
COMMENT ON COLUMN address_change.flat_file_batch.generation_claimed_at IS
  'Lease start for generating the frozen batch file; expired claims can be resumed.';
COMMENT ON COLUMN address_change.flat_file_batch.generation_last_error IS
  'Last generation error, cleared after file bytes are saved successfully.';
