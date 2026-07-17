import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Modal, ModalBody, Select, useToast } from '@nexusdesk/ui';
import { Ban, Copy, Plus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { copyToClipboard } from '@/lib/clipboard';
import {
  buildGuestJoinUrl,
  formatGuestInviteText,
  formatGuestLinkExpiry,
  INVITE_TEMPLATE_OPTIONS,
  normalizeInviteTemplate,
  type GuestInviteTemplate,
} from '@/lib/guest-invite';
import {
  createGuestLink,
  deleteGuestLink,
  listGuestLinks,
  revokeGuestLink,
  type CreateGuestLinkResult,
  type GuestAccessLink,
} from '@/api/guest-links';
import { PageHeader } from '@/components/common/ui';

type PendingAction =
  | { type: 'revoke'; link: GuestAccessLink }
  | { type: 'delete'; link: GuestAccessLink }
  | null;

export function GuestLinksPage() {
  const orgId = useAuthStore((s) => s.organizationId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [inviteTemplate, setInviteTemplate] = useState<GuestInviteTemplate>('zoom');
  const [created, setCreated] = useState<CreateGuestLinkResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const links = useQuery({
    queryKey: ['guest-links', orgId],
    enabled: Boolean(orgId),
    queryFn: () => listGuestLinks(orgId!),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createGuestLink(orgId!, { maxUses: 5, ttl: 'never', inviteTemplate }),
    onSuccess: (res) => {
      setCreated(res);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['guest-links', orgId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    },
  });

  const revokeMut = useMutation({
    mutationFn: (linkId: string) => revokeGuestLink(orgId!, linkId),
    onSuccess: (_data, linkId) => {
      setError(null);
      setPending(null);
      if (created?.link.id === linkId) setCreated(null);
      void qc.invalidateQueries({ queryKey: ['guest-links', orgId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to revoke link');
      setPending(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (linkId: string) => deleteGuestLink(orgId!, linkId),
    onSuccess: (_data, linkId) => {
      setError(null);
      setPending(null);
      if (created?.link.id === linkId) setCreated(null);
      void qc.invalidateQueries({ queryKey: ['guest-links', orgId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete link');
      setPending(null);
    },
  });

  const copyJoin = async (
    joinUrl: string,
    sourceId = 'created',
    meta?: { label?: string; expiresAt?: string; template?: GuestInviteTemplate },
  ) => {
    const inviteText = formatGuestInviteText({
      joinUrl,
      label: meta?.label,
      expiresAt: meta?.expiresAt,
      template: meta?.template,
    });
    const ok = await copyToClipboard(inviteText);
    if (ok) {
      setCopiedId(sourceId);
      window.setTimeout(() => setCopiedId((cur) => (cur === sourceId ? null : cur)), 2000);
      toast({
        title: 'Invite copied',
        description: 'Full meeting-style invite is on your clipboard.',
        variant: 'success',
        durationMs: 2500,
      });
      return;
    }
    toast({
      title: 'Could not copy automatically',
      description: 'Select and copy the invite from the prompt.',
      variant: 'warning',
    });
    window.prompt('Copy this support invite:', inviteText);
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.type === 'revoke') revokeMut.mutate(pending.link.id);
    else deleteMut.mutate(pending.link.id);
  };

  const actionPending = revokeMut.isPending || deleteMut.isPending;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Support links"
        description="Create a link, send it to the Windows user, and they install the agent. When their PC comes online, connect from Devices."
      />

      <section className="tui-box">
        <div className="tui-box-title">create_windows_link</div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-accent" htmlFor="guest-template">
                Invite template
              </label>
              <Select
                id="guest-template"
                value={inviteTemplate}
                onChange={(e) => setInviteTemplate(e.target.value as GuestInviteTemplate)}
                options={INVITE_TEMPLATE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                className="h-10 rounded-none font-mono text-xs"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => createMut.mutate()}
                loading={createMut.isPending}
                disabled={!orgId}
                className="w-full rounded-none font-mono"
              >
                <Plus className="mr-2 h-4 w-4" />
                generate
              </Button>
            </div>
          </div>

          {error ? (
            <p className="font-mono text-xs text-destructive">
              <span className="tui-tag tui-tag-err">[ EXIT ]</span> {error}
            </p>
          ) : null}

          {created ? (
            <div className="space-y-3 border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium text-primary">Share this with the Windows user</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {formatGuestInviteText({
                  joinUrl: created.joinUrl,
                  label: created.link.label,
                  expiresAt: created.link.expiresAt,
                  template: normalizeInviteTemplate(created.link.inviteTemplate),
                })}
              </pre>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="secondary"
                  className="rounded-none font-mono"
                  onClick={() =>
                    void copyJoin(created.joinUrl, 'created', {
                      label: created.link.label,
                      expiresAt: created.link.expiresAt,
                      template: normalizeInviteTemplate(created.link.inviteTemplate),
                    })
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copiedId === 'created' ? 'copied' : 'copy invite'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Code <strong>{created.link.code}</strong> · expires{' '}
                {formatGuestLinkExpiry(created.link.expiresAt)}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-xs text-accent">── active_and_recent_links ──</h2>
        <div className="tui-box overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wider text-accent">
              <tr>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Uses</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(links.data ?? []).map((link) => {
                const isActive = link.status === 'active';
                return (
                  <tr key={link.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{link.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {INVITE_TEMPLATE_OPTIONS.find(
                        (t) => t.value === normalizeInviteTemplate(link.inviteTemplate),
                      )?.label ?? 'Zoom Meeting'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={isActive ? 'default' : 'secondary'}>{link.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {link.usedCount}/{link.maxUses}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatGuestLinkExpiry(link.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-none font-mono text-[11px]"
                          onClick={() => {
                            const url = buildGuestJoinUrl(
                              window.location.origin,
                              link.code,
                              normalizeInviteTemplate(link.inviteTemplate),
                            );
                            void copyJoin(url, link.id, {
                              label: link.label,
                              expiresAt: link.expiresAt,
                              template: normalizeInviteTemplate(link.inviteTemplate),
                            });
                          }}
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          {copiedId === link.id ? 'copied' : 'copy invite'}
                        </Button>
                        {isActive ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 rounded-none font-mono text-[11px]"
                            onClick={() => setPending({ type: 'revoke', link })}
                          >
                            <Ban className="mr-1.5 h-3.5 w-3.5" />
                            revoke
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 rounded-none font-mono text-[11px]"
                            onClick={() => setPending({ type: 'delete', link })}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!links.isLoading && (links.data?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <span className="tui-tag tui-tag-info">[ INFO ]</span> No support links yet.
                    Generate one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(pending)}
        onClose={() => {
          if (!actionPending) setPending(null);
        }}
        title={pending?.type === 'revoke' ? 'Revoke support link' : 'Delete support link'}
      >
        <ModalBody>
          <div className="space-y-4 font-mono text-sm">
            <p className="text-muted-foreground">
              {pending?.type === 'revoke' ? (
                <>
                  Revoke <span className="text-primary">{pending.link.label}</span> (
                  {pending.link.code})? Installers using this code will stop working. You can delete
                  it from the list afterward.
                </>
              ) : pending ? (
                <>
                  Permanently delete <span className="text-primary">{pending.link.label}</span> (
                  {pending.link.code})? This cannot be undone.
                </>
              ) : null}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none font-mono"
                disabled={actionPending}
                onClick={() => setPending(null)}
              >
                cancel
              </Button>
              <Button
                type="button"
                variant={pending?.type === 'delete' ? 'destructive' : 'secondary'}
                className="rounded-none font-mono"
                loading={actionPending}
                onClick={confirmPending}
              >
                {pending?.type === 'revoke' ? 'revoke' : 'delete'}
              </Button>
            </div>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}
