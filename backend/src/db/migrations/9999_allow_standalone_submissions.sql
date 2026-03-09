-- migration to allow standalone evidence submissions
ALTER TABLE evidence_submissions ALTER COLUMN task_id DROP NOT NULL;
