-- Add Settings menu for admin only
INSERT INTO menus (id, title, path, icon, label, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000006', 'Settings', '/settings', 'settings-icon', '', 99)
ON CONFLICT (id) DO UPDATE SET
  title      = EXCLUDED.title,
  path       = EXCLUDED.path,
  icon       = EXCLUDED.icon,
  label      = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order;

INSERT INTO role_menus (role, menu_id) VALUES
  ('admin', 'b1000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;
