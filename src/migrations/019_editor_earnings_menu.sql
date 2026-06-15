-- Add Earnings menu to editor role
INSERT INTO role_menus (role, menu_id)
VALUES ('editor', 'b1000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;
