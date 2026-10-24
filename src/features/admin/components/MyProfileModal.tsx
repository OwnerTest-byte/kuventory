import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/context/AuthContext';
import {
  updateMyProfile,
  fetchMyContactLinks,
  upsertContactLink,
  deleteContactLink,
  uploadProfileAvatar,
  type ProfileContactLink,
} from '../services/profileService';
import {
  User,
  Phone,
  Mail,
  Shield,
  Plus,
  Trash2,
  ExternalLink,
  Camera,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface MyProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SUPPORTED_PLATFORMS = [
  { id: 'phone', label: 'Phone / Hotline', prefix: 'tel:' },
  { id: 'email', label: 'Support Email', prefix: 'mailto:' },
  { id: 'facebook', label: 'Facebook / Messenger', prefix: 'https://' },
  { id: 'whatsapp', label: 'WhatsApp', prefix: 'https://wa.me/' },
  { id: 'telegram', label: 'Telegram', prefix: 'https://t.me/' },
  { id: 'instagram', label: 'Instagram', prefix: 'https://instagram.com/' },
  { id: 'linkedin', label: 'LinkedIn', prefix: 'https://linkedin.com/in/' },
  { id: 'website', label: 'Website / Help Center', prefix: 'https://' },
  { id: 'other', label: 'Other Web Link', prefix: 'https://' },
];

export function MyProfileModal({ open, onOpenChange }: MyProfileModalProps) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const isPrivileged = profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN';

  // Form State
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [showOnLockoutScreen, setShowOnLockoutScreen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  // Contact Links State
  const [contactLinks, setContactLinks] = useState<ProfileContactLink[]>([]);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkPlatform, setNewLinkPlatform] = useState('facebook');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // UI Status
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [saveSuccessTime, setSaveSuccessTime] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize data from profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setJobTitle((profile as any).job_title || '');
      setPhone(profile.phone || '');
      setSupportPhone((profile as any).support_phone || profile.phone || '');
      setSupportEmail((profile as any).support_email || '');
      setShowOnLockoutScreen(Boolean((profile as any).show_on_lockout_screen));
      setAvatarUrl((profile as any).avatar_url || '');
    }
  }, [profile, user]);

  // Load contact links
  useEffect(() => {
    if (open && user?.id) {
      fetchMyContactLinks()
        .then(setContactLinks)
        .catch(err => console.warn('Could not load contact links:', err));
    }
  }, [open, user]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setErrorMessage(null);
    try {
      const uploadedUrl = await uploadProfileAvatar(file);
      setAvatarUrl(uploadedUrl);
    } catch (err: any) {
      setErrorMessage(err.message || 'Avatar upload failed.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;

    setErrorMessage(null);
    try {
      let finalUrl = newLinkUrl.trim();
      if (!/^(https:\/\/|mailto:|tel:)/i.test(finalUrl)) {
        if (newLinkPlatform === 'phone') finalUrl = `tel:${finalUrl.replace(/[^0-9+]/g, '')}`;
        else if (newLinkPlatform === 'email') finalUrl = `mailto:${finalUrl}`;
        else finalUrl = `https://${finalUrl}`;
      }

      const created = await upsertContactLink({
        label: newLinkLabel.trim(),
        platform: newLinkPlatform,
        url: finalUrl,
        is_public: true,
        sort_order: contactLinks.length,
      });

      setContactLinks(prev => [...prev, created]);
      setNewLinkLabel('');
      setNewLinkUrl('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save contact link.');
    }
  };

  const handleDeleteLink = async (linkId?: string) => {
    if (!linkId) return;
    try {
      await deleteContactLink(linkId);
      setContactLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete contact link.');
    }
  };

  const handleSaveProfile = async () => {
    setErrorMessage(null);
    setSaveSuccessTime(null);

    const trimmedDisplay = displayName.trim();
    const trimmedSupportEmail = supportEmail.trim();
    const hasPublicChannel =
      supportPhone.trim() !== '' ||
      trimmedSupportEmail !== '' ||
      contactLinks.some(l => l.is_public);

    // Honest validation: a save must either publish something real or say why
    // it cannot — never succeed silently into invisibility.
    if (!trimmedDisplay) {
      setErrorMessage('Display name is required.');
      return;
    }
    if (trimmedSupportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedSupportEmail)) {
      setErrorMessage('Support email must be a valid email address.');
      return;
    }
    if (showOnLockoutScreen && !hasPublicChannel) {
      setErrorMessage(
        'Add at least one contact channel (phone, email, or link) or uncheck "Show on locked login screen" — otherwise you will never appear on the recovery screen.'
      );
      return;
    }

    setIsSaving(true);

    try {
      await updateMyProfile({
        displayName: trimmedDisplay,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        jobTitle: jobTitle.trim(),
        phone: phone.trim(),
        supportPhone: supportPhone.trim(),
        supportEmail: trimmedSupportEmail,
        showOnLockoutScreen,
        avatarUrl,
      });

      setSaveSuccessTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['public-support-contacts'] });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update profile settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto p-0 rounded-2xl bg-card border-border shadow-2xl">
        <DialogHeader className="p-6 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">My Profile & Contact Settings</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Manage your personal identity, contact channels, and locked-screen support visibility.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccessTime && (
            <div className="p-3.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-start gap-2" role="status">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>
                {(showOnLockoutScreen && (supportPhone.trim() !== '' || supportEmail.trim() !== '' || contactLinks.some(l => l.is_public)))
                  ? `Saved at ${saveSuccessTime}. Your support channels are now live on the login recovery and lockout screens.`
                  : `Saved at ${saveSuccessTime}. Your contacts stay private — they are not shown on the recovery screen.`}
              </span>
            </div>
          )}

          {/* Avatar & Display Name Header */}
          <div className="flex items-center gap-5 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center text-muted-foreground shadow-sm">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-9 h-9" />
                )}
              </div>
              <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-medium">
                {isUploadingAvatar ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-4 h-4 mb-0.5" />
                    <span>Change</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                  disabled={isUploadingAvatar}
                />
              </label>
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-foreground">{displayName || user?.email || 'User'}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                  {profile?.role || 'USER'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                <span>{user?.email}</span>
                <span className="text-[10px] text-muted-foreground/70 italic">(Managed by Supabase Auth)</span>
              </p>
            </div>
          </div>

          {/* Basic Fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border/40 pb-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Identity & Information</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name" className="text-xs font-semibold">Display Name *</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="h-10 text-sm rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="job-title" className="text-xs font-semibold">Job Title / Role Label</Label>
                <Input
                  id="job-title"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Branch Manager"
                  className="h-10 text-sm rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="first-name" className="text-xs font-semibold">First Name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="h-10 text-sm rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="last-name" className="text-xs font-semibold">Last Name</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="h-10 text-sm rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Support Contacts (Admin / Super Admin Configuration) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/40 pb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary" />
                <span>Support Contact Channels</span>
              </h3>
              {isPrivileged && (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={showOnLockoutScreen}
                      onChange={e => setShowOnLockoutScreen(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Show on locked login screen</span>
                  </label>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Staff recovering a password or locked out will see your name, hotline, email, and links on the
                    Forgot Password and lockout screens — but only the channels you actually filled above.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="support-phone" className="text-xs font-semibold">Work / Support Phone</Label>
                <Input
                  id="support-phone"
                  value={supportPhone}
                  onChange={e => setSupportPhone(e.target.value)}
                  placeholder="e.g. +63 991 710 1298"
                  className="h-10 text-sm rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">Will appear as clickable tel: hotline if opted in.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="support-email" className="text-xs font-semibold">Support Contact Email</Label>
                <Input
                  id="support-email"
                  type="email"
                  value={supportEmail}
                  onChange={e => setSupportEmail(e.target.value)}
                  placeholder="e.g. support@kuventory.com"
                  className="h-10 text-sm rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">Can be a departmental or support address.</p>
              </div>
            </div>
          </div>

          {/* Social & Support Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b border-border/40 pb-2">
              <ExternalLink className="w-4 h-4 text-primary" />
              <span>Custom Social & Support Links</span>
            </h3>

            {/* Existing links */}
            <div className="space-y-2">
              {contactLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  No custom links added yet. Add links like Facebook, Messenger, WhatsApp, or Telegram below.
                </p>
              ) : (
                contactLinks.map(link => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-primary/10 text-primary">
                        {link.platform}
                      </span>
                      <span className="font-semibold text-foreground truncate">{link.label}:</span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate max-w-xs"
                      >
                        {link.url}
                      </a>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteLink(link.id)}
                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 rounded-lg shrink-0 ml-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* Add new link form */}
            <form onSubmit={handleAddLink} className="p-3.5 rounded-xl bg-muted/20 border border-border/50 space-y-3">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>Add Contact / Social Channel</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div>
                  <Input
                    placeholder="Label (e.g. Official Page)"
                    value={newLinkLabel}
                    onChange={e => setNewLinkLabel(e.target.value)}
                    className="h-9 text-xs rounded-lg min-w-0 w-full"
                    required
                  />
                </div>

                <div>
                  <select
                    value={newLinkPlatform}
                    onChange={e => setNewLinkPlatform(e.target.value)}
                    className="w-full h-9 text-xs rounded-lg border border-input bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  >
                    {SUPPORTED_PLATFORMS.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="URL (https://... or number)"
                    value={newLinkUrl}
                    onChange={e => setNewLinkUrl(e.target.value)}
                    className="h-9 text-xs rounded-lg flex-1"
                    required
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-9 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg shrink-0"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border/60 bg-muted/10 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 text-xs rounded-xl"
          >
            Close
          </Button>

          <Button
            type="button"
            disabled={isSaving}
            onClick={handleSaveProfile}
            className="h-9 px-5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Save Profile Settings</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
