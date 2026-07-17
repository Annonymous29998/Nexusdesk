import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Modal, ModalBody, Select } from '@nexusdesk/ui';
import { HUMAN_ROLES } from '@nexusdesk/shared';
import { UserRole } from '@nexusdesk/types';
import { inviteUser, listUsers, updateUser } from '@/api/users';
import { DataTable, EmptyState, LoadingBlock, PageHeader, RoleBadge } from '@/components/common/ui';
import { useOrgId } from '@/hooks/useDevices';
import { formatRelative } from '@/lib/utils';

export function UsersPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.Operator);

  const users = useQuery({
    queryKey: ['users', orgId, search, role],
    enabled: Boolean(orgId),
    queryFn: () =>
      listUsers({
        orgId: orgId!,
        search: search || undefined,
        role: role || undefined,
      }),
  });

  const invite = useMutation({
    mutationFn: () => inviteUser(orgId!, { email, role: inviteRole }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      setInviteOpen(false);
      setEmail('');
    },
  });

  const patchUser = useMutation({
    mutationFn: ({ userId, role: nextRole, isActive }: { userId: string; role?: UserRole; isActive?: boolean }) =>
      updateUser(orgId!, userId, { role: nextRole, isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Seat management and role assignments"
        actions={
          <Button onClick={() => setInviteOpen(true)}>Invite user</Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={[
            { value: '', label: 'All roles' },
            ...HUMAN_ROLES.map((r) => ({ value: r, label: r })),
          ]}
        />
      </div>

      {users.isLoading ? (
        <LoadingBlock />
      ) : !users.data?.items.length ? (
        <EmptyState title="No users found" />
      ) : (
        <DataTable headers={['Name', 'Email', 'Role', 'Status', 'Last login', 'Actions']}>
          {users.data.items.map((user) => (
            <tr key={user.id} className="hover:bg-muted/40">
              <td className="px-4 py-3 font-medium">{user.displayName}</td>
              <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
              <td className="px-4 py-3">
                <Select
                  value={user.role}
                  onChange={(e) =>
                    patchUser.mutate({ userId: user.id, role: e.target.value as UserRole })
                  }
                  options={HUMAN_ROLES.map((r) => ({ value: r, label: r }))}
                />
              </td>
              <td className="px-4 py-3">
                <RoleBadge role={user.role} />
                <span className="ml-2 text-xs text-muted-foreground">
                  {user.isActive ? 'Active' : 'Disabled'}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{formatRelative(user.lastLoginAt)}</td>
              <td className="px-4 py-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patchUser.mutate({ userId: user.id, isActive: !user.isActive })
                  }
                >
                  {user.isActive ? 'Disable' : 'Enable'}
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite teammate">
        <ModalBody>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="invite-email">
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Select
              label="Role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              options={HUMAN_ROLES.map((r) => ({ value: r, label: r }))}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={invite.isPending}>
                Send invite
              </Button>
            </div>
          </form>
        </ModalBody>
      </Modal>
    </div>
  );
}
