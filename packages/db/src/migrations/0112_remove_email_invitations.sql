-- Email invitations were removed in favor of Discord-style invite links
-- (/invite/:code). The Better Auth `invitation` table is kept for plugin
-- compatibility but no longer used, so purge any pending rows.
DELETE FROM "invitation";
