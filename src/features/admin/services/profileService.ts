import { supabase } from '@/lib/supabase';

export interface PublicSupportContactLink {
  id: string;
  label: string;
  platform: string;
  url: string;
  sort_order: number;
}

export interface PublicSupportContact {
  display_name: string | null;
  job_title: string;
  support_phone: string | null;
  support_email: string | null;
  avatar_url: string | null;
  role: string;
  links: PublicSupportContactLink[];
}

export interface ProfileContactLink {
  id?: string;
  profile_id?: string;
  label: string;
  platform: string;
  url: string;
  is_public: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateProfileParams {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  supportPhone?: string;
  supportEmail?: string;
  jobTitle?: string;
  showOnLockoutScreen?: boolean;
  avatarUrl?: string;
}

/**
 * Fetch publicly displayed administrator support contacts for the lockout / login recovery screen.
 * Non-sensitive projection: only opted-in contacts with public links are returned.
 */
export async function fetchPublicSupportContacts(): Promise<PublicSupportContact[]> {
  try {
    const { data, error } = await supabase.rpc('get_public_support_contacts');
    if (error) {
      console.warn('get_public_support_contacts RPC error:', error.message);
      return [];
    }
    return (data as PublicSupportContact[]) || [];
  } catch (err) {
    console.warn('fetchPublicSupportContacts network error:', err);
    return [];
  }
}

/**
 * Self-only profile update via secure database RPC.
 * Disallows privilege escalation or modification of role/id.
 */
export async function updateMyProfile(params: UpdateProfileParams): Promise<any> {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_display_name: params.displayName || null,
    p_first_name: params.firstName || null,
    p_last_name: params.lastName || null,
    p_phone: params.phone || null,
    p_support_phone: params.supportPhone || null,
    p_support_email: params.supportEmail || null,
    p_job_title: params.jobTitle || null,
    p_show_on_lockout_screen: params.showOnLockoutScreen ?? null,
    p_avatar_url: params.avatarUrl || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to update profile.');
  }

  return data;
}

/**
 * Fetch contact links owned by the current authenticated user.
 */
export async function fetchMyContactLinks(): Promise<ProfileContactLink[]> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user?.id) return [];

  const { data, error } = await supabase
    .from('profile_contact_links')
    .select('*')
    .eq('profile_id', authData.user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Error fetching profile contact links:', error.message);
    return [];
  }

  return (data as ProfileContactLink[]) || [];
}

/**
 * Create or update a profile contact link.
 * Validates protocol to prevent dangerous javascript: or data: injection.
 */
export async function upsertContactLink(link: ProfileContactLink): Promise<ProfileContactLink> {
  const cleanUrl = link.url.trim();
  const cleanLabel = link.label.trim();

  if (!cleanLabel) {
    throw new Error('Contact link label is required.');
  }

  if (!cleanUrl) {
    throw new Error('Contact URL or address is required.');
  }

  const isSafeProtocol = /^(https:\/\/|mailto:|tel:)/i.test(cleanUrl);
  if (!isSafeProtocol) {
    throw new Error('Security policy: URLs must start with https://, mailto:, or tel:');
  }

  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id;
  if (!currentUserId) {
    throw new Error('Authentication required.');
  }

  const payload = {
    profile_id: currentUserId,
    label: cleanLabel,
    platform: link.platform || 'website',
    url: cleanUrl,
    is_public: link.is_public ?? true,
    sort_order: link.sort_order || 0,
    updated_at: new Date().toISOString(),
  };

  if (link.id) {
    const { data, error } = await supabase
      .from('profile_contact_links')
      .update(payload)
      .eq('id', link.id)
      .eq('profile_id', currentUserId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as ProfileContactLink;
  } else {
    const { data, error } = await supabase
      .from('profile_contact_links')
      .insert({ ...payload, created_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as ProfileContactLink;
  }
}

/**
 * Delete a contact link owned by the user.
 */
export async function deleteContactLink(linkId: string): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id;
  if (!currentUserId) throw new Error('Authentication required.');

  const { error } = await supabase
    .from('profile_contact_links')
    .delete()
    .eq('id', linkId)
    .eq('profile_id', currentUserId);

  if (error) throw new Error(error.message);
}

/**
 * Upload avatar image to Supabase Storage with size and MIME validation.
 */
export async function uploadProfileAvatar(file: File): Promise<string> {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_BYTES = 2 * 1024 * 1024; // 2MB limit

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP images are permitted for profile avatars.');
  }

  if (file.size > MAX_BYTES) {
    throw new Error('Avatar image size must be under 2MB.');
  }

  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id;
  if (!currentUserId) throw new Error('Authentication required.');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const filePath = `${currentUserId}/avatar_${Date.now()}.${ext}`;

  // Upload to standard avatars bucket
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    console.error('Avatars bucket upload error:', uploadError.message);
    throw new Error(`Failed to upload avatar to storage: ${uploadError.message}. Please verify storage bucket permissions.`);
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return urlData.publicUrl;
}
