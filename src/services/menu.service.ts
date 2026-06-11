import { MenuRow, MenuItem } from '../models/menu.model';

export function buildMenuTree(flatMenus: MenuRow[]): MenuItem[] {
  const map = new Map<string, MenuItem>();

  for (const row of flatMenus) {
    map.set(row.id, {
      id: row.id,
      title: row.title,
      path: row.path,
      icon: row.icon,
      sort_order: row.sort_order,
      children: [],
    });
  }

  const roots: MenuItem[] = [];

  for (const row of flatMenus) {
    const node = map.get(row.id)!;
    if (row.parent_id === null) {
      roots.push(node);
    } else {
      const parent = map.get(row.parent_id);
      if (parent) {
        parent.children = parent.children ?? [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  const sortNodes = (nodes: MenuItem[]): MenuItem[] =>
    nodes
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((n) => ({
        ...n,
        children: n.children && n.children.length > 0 ? sortNodes(n.children) : undefined,
      }));

  return sortNodes(roots);
}
