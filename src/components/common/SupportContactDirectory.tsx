import { Phone, Mail, ExternalLink, UserRound, ShieldCheck } from 'lucide-react';
import type { PublicSupportContact } from '@/features/admin/services/profileService';

interface SupportContactDirectoryProps {
  contacts: PublicSupportContact[];
  /** Rendered when no administrator has published any public contact method. */
  emptyFallback?: React.ReactNode;
  className?: string;
}

function initialsFor(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shared administrator contact directory for the account-recovery dialog and
 * the login lockout card — one source of truth, identical presentation.
 *
 * One card per opted-in administrator (server-ordered: System Administrator
 * first, then branch admins). Each card shows ONLY the channels that
 * administrator actually filled: hotline, email, and their own public links.
 * Cards stack on mobile and sit 2-up on >= sm screens.
 */
export function SupportContactDirectory({ contacts, emptyFallback, className }: SupportContactDirectoryProps) {
  // Belt-and-suspenders: the server already filters these, but never render a
  // contact card with no way to reach them.
  const contactable = contacts.filter(
    c => (c.support_phone && c.support_phone.trim() !== '') || (c.support_email && c.support_email.trim() !== '') || (Array.isArray(c.links) && c.links.length > 0)
  );

  if (contactable.length === 0) {
    return emptyFallback ? <div className={className}>{emptyFallback}</div> : null;
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
        <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          <span>Contact an Administrator</span>
        </span>
        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Official Channels</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5">
        {contactable.map((contact, idx) => (
          <div
            key={`${contact.display_name ?? 'admin'}-${idx}`}
            className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-2 text-xs"
          >
            <div className="flex items-center gap-2.5">
              {contact.avatar_url ? (
                <img src={contact.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border/60 shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0" aria-hidden="true">
                  {initialsFor(contact.display_name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate">{contact.display_name || 'Administrator'}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wide">
                  {contact.job_title}
                </span>
              </div>
            </div>

            <div className="space-y-1 text-[11px]">
              {contact.support_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                  <a href={`tel:${contact.support_phone}`} className="hover:underline font-mono text-foreground font-bold break-all">
                    {contact.support_phone}
                  </a>
                </div>
              )}

              {contact.support_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                  <a href={`mailto:${contact.support_email}`} className="hover:underline text-foreground font-semibold break-all">
                    {contact.support_email}
                  </a>
                </div>
              )}

              {contact.links && contact.links.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {contact.links.map(link => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground border border-border/60 transition-colors"
                    >
                      <span>{link.label}</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/80 italic pt-2 flex items-center gap-1">
        <UserRound className="w-3 h-3" />
        Verify your identity through these official channels during account recovery.
      </p>
    </div>
  );
}
