-- Seed menus and role_menus
-- Using fixed UUIDs so this is idempotent

INSERT INTO menus (id, title, path, icon, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Dashboard',            '/dashboard',       'home-icon',     1),
  ('a1000000-0000-0000-0000-000000000002', 'Kelola User',          '/admin/users',     'users-icon',    2),
  ('a1000000-0000-0000-0000-000000000003', 'Semua Laporan',        '/reports',         'list-icon',     3),
  ('a1000000-0000-0000-0000-000000000004', 'Pengaturan',           '/settings',        'settings-icon', 4),
  ('a1000000-0000-0000-0000-000000000005', 'Tulis Berita/Laporan', '/report/create',   'edit-icon',     2),
  ('a1000000-0000-0000-0000-000000000006', 'Laporan Saya',         '/report/mine',     'file-icon',     3),
  ('a1000000-0000-0000-0000-000000000007', 'Review Laporan',       '/report/review',   'check-icon',    2)
ON CONFLICT (id) DO NOTHING;

-- admin: Dashboard, Kelola User, Semua Laporan, Pengaturan
INSERT INTO role_menus (role, menu_id) VALUES
  ('admin', 'a1000000-0000-0000-0000-000000000001'),
  ('admin', 'a1000000-0000-0000-0000-000000000002'),
  ('admin', 'a1000000-0000-0000-0000-000000000003'),
  ('admin', 'a1000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- reporter: Dashboard, Tulis Berita/Laporan, Laporan Saya
INSERT INTO role_menus (role, menu_id) VALUES
  ('reporter', 'a1000000-0000-0000-0000-000000000001'),
  ('reporter', 'a1000000-0000-0000-0000-000000000005'),
  ('reporter', 'a1000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- reviewer: Dashboard, Review Laporan
INSERT INTO role_menus (role, menu_id) VALUES
  ('reviewer', 'a1000000-0000-0000-0000-000000000001'),
  ('reviewer', 'a1000000-0000-0000-0000-000000000007')
ON CONFLICT DO NOTHING;
