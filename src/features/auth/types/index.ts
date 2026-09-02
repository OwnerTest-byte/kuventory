export type Role = 'ADMIN' | 'USER';

export type Profile = {
  id: string;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
};
