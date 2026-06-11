-- Rename enum value reviewer → editor
-- Existing rows in users and role_menus are updated automatically by PostgreSQL
ALTER TYPE user_role RENAME VALUE 'reviewer' TO 'editor';
