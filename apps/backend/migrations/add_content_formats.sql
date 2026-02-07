-- Migration: Add multiple content format fields to source_docs table
-- Run this migration to add support for markdown and HTML content formats

-- Add new columns for different content representations
ALTER TABLE source_docs 
    ADD COLUMN IF NOT EXISTS content_text_raw TEXT,
    ADD COLUMN IF NOT EXISTS content_markdown TEXT,
    ADD COLUMN IF NOT EXISTS content_html_clean TEXT;

-- Migrate existing data: copy content_text to content_text_raw for backward compatibility
UPDATE source_docs 
SET content_text_raw = content_text 
WHERE content_text IS NOT NULL 
  AND content_text_raw IS NULL;

-- Add comment to document the purpose of these fields
COMMENT ON COLUMN source_docs.content_text_raw IS 'Raw extracted text with whitespace preserved';
COMMENT ON COLUMN source_docs.content_markdown IS 'Clean markdown representation when available (extracted via trafilatura)';
COMMENT ON COLUMN source_docs.content_html_clean IS 'Cleaned HTML with main content only';

-- Optional: Create index on content_hash for faster lookups
CREATE INDEX IF NOT EXISTS idx_source_docs_content_hash ON source_docs(content_hash);
