-- Follow-Through Ledger — Notion sync migration
-- Run this once in your Supabase project's SQL Editor (in addition to the
-- original schema.sql, which should already be applied).

alter table commitments
  add column if not exists notion_page_id text;
