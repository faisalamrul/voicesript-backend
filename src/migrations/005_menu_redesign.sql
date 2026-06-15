-- Add label column to menus
ALTER TABLE menus ADD COLUMN IF NOT EXISTS label VARCHAR(100);

-- Clear existing data (role_menus first due to FK)
DELETE FROM role_menus;
DELETE FROM menus;

-- Insert new menus
-- b-series UUIDs: new menu set
INSERT INTO menus (id, title, path, icon, label, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Jobs',     '/jobs',             'briefcase-icon', 'core',    1),
  ('b1000000-0000-0000-0000-000000000002', 'Reporter', '/admin/reporters',  'users-icon',     'core',    2),
  ('b1000000-0000-0000-0000-000000000003', 'Editor',   '/admin/editors',    'edit-icon',      'core',    3),
  ('b1000000-0000-0000-0000-000000000004', 'Payments', '/finance/payments', 'wallet-icon',    'finance', 4),
  ('b1000000-0000-0000-0000-000000000005', 'Earnings', '/earnings',         'chart-icon',     'finance', 2)
ON CONFLICT (id) DO UPDATE SET
  title      = EXCLUDED.title,
  path       = EXCLUDED.path,
  icon       = EXCLUDED.icon,
  label      = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order;

-- admin: Jobs, Reporter, Editor (core) + Payments (finance)
INSERT INTO role_menus (role, menu_id) VALUES
  ('admin', 'b1000000-0000-0000-0000-000000000001'),
  ('admin', 'b1000000-0000-0000-0000-000000000002'),
  ('admin', 'b1000000-0000-0000-0000-000000000003'),
  ('admin', 'b1000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- reporter: Jobs (core) + Earnings (finance)
INSERT INTO role_menus (role, menu_id) VALUES
  ('reporter', 'b1000000-0000-0000-0000-000000000001'),
  ('reporter', 'b1000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;

-- reviewer/editor: Jobs (core)
INSERT INTO role_menus (role, menu_id) VALUES
  ('reviewer', 'b1000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
