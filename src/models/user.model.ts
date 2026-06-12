import { Role } from '../types';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  city: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: string;
  name: string;
  email: string;
  role: Role;
  city: string | null;
  created_at: Date;
}
