-- Seed default admin user
-- Password: Admin@123 (change immediately after first login)
-- Hash: bcrypt(sha256('Admin@123'), rounds=12)

INSERT INTO users (id, name, email, password_hash, role)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'Super Admin',
  'admin@voicescript.com',
  '$2b$12$n0EjuOIJOR0x.9wohnT1muOoQYtzaYyIllsdm5aPaiFN3/dchdUE.',
  'admin'
)
ON CONFLICT (id) DO NOTHING;
