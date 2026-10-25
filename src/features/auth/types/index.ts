export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

export type Profile = {
  id: string;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  support_phone?: string | null;
  support_email?: string | null;
  job_title?: string | null;
  show_on_lockout_screen?: boolean;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
};
