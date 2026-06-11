export interface MenuRow {
  id: string;
  title: string;
  path: string | null;
  icon: string | null;
  label: string | null;
  parent_id: string | null;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  title: string;
  path: string | null;
  icon: string | null;
  label: string | null;
  sort_order: number;
  children?: MenuItem[];
}
