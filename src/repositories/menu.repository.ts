import { pool } from '../config/database';
import { MenuRow } from '../models/menu.model';
import { Role } from '../types';

export async function findMenusByRole(role: Role): Promise<MenuRow[]> {
  const { rows } = await pool.query<MenuRow>(
    `SELECT m.id, m.title, m.path, m.icon, m.label, m.parent_id, m.sort_order
     FROM menus m
     INNER JOIN role_menus rm ON rm.menu_id = m.id
     WHERE rm.role = $1
     ORDER BY m.sort_order ASC`,
    [role]
  );
  return rows;
}
