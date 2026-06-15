-- Rename Settings menu to Users, update label to admin
UPDATE menus
SET title = 'Users', path = '/admin/users', icon = 'users-icon', label = 'admin'
WHERE id = 'b1000000-0000-0000-0000-000000000006';
