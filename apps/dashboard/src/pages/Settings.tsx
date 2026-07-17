import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Toggle } from '@nexusdesk/ui';
import { getOrganization, updateOrganization, updateOrganizationSettings } from '@/api/orgs';
import { isDemoMode, setDemoMode } from '@/api/client';
import { LoadingBlock, PageHeader } from '@/components/common/ui';
import { useOrgId } from '@/hooks/useDevices';
import { useThemeStore } from '@/stores/theme';
import { useAuthStore } from '@/stores/auth';

export function SettingsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [demo, setDemo] = useState(isDemoMode());
  const [name, setName] = useState('');
  const [idleTimeout, setIdleTimeout] = useState(30);
  const [requireMfa, setRequireMfa] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState(true);

  const org = useQuery({
    queryKey: ['organization', orgId],
    enabled: Boolean(orgId),
    queryFn: () => getOrganization(orgId!),
  });

  useEffect(() => {
    if (org.data) {
      setName(org.data.name);
      setIdleTimeout(org.data.settings.sessionIdleTimeoutMinutes);
      setRequireMfa(org.data.settings.requireMfa);
      setRecordingEnabled(org.data.settings.recordingEnabled);
    }
  }, [org.data]);

  const saveOrg = useMutation({
    mutationFn: async () => {
      await updateOrganization(orgId!, { name });
      await updateOrganizationSettings(orgId!, {
        sessionIdleTimeoutMinutes: idleTimeout,
        requireMfa,
        recordingEnabled,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organization'] });
      void qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  if (org.isLoading) return <LoadingBlock />;

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" description="Profile, organization, and console preferences" />

      <section className="rounded-nd-xl border border-border bg-card/80 p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Profile</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="mt-1 font-medium">{user?.displayName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="mt-1 font-medium">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="mt-1 capitalize">{user?.role}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-nd-xl border border-border bg-card/80 p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Organization</h2>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="org-name">
              Display name
            </label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="idle">
              Session idle timeout (minutes)
            </label>
            <Input
              id="idle"
              type="number"
              min={5}
              max={240}
              value={idleTimeout}
              onChange={(e) => setIdleTimeout(Number(e.target.value))}
            />
          </div>
          <Toggle
            checked={requireMfa}
            onChange={setRequireMfa}
            label="Require MFA for all operators"
          />
          <Toggle
            checked={recordingEnabled}
            onChange={setRecordingEnabled}
            label="Enable session recording"
          />
          <Button loading={saveOrg.isPending} onClick={() => saveOrg.mutate()}>
            Save organization settings
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-nd-xl border border-border bg-card/80 p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Appearance</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={theme === mode ? 'primary' : 'outline'}
              onClick={() => setTheme(mode)}
              className="capitalize"
            >
              {mode}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-nd-xl border border-border bg-card/80 p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Developer</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Demo mode serves local mock data when the API is unreachable (or forced on).
        </p>
        <div className="mt-4">
          <Toggle
            checked={demo}
            onChange={(value) => {
              setDemo(value);
              setDemoMode(value);
            }}
            label="Force demo mode"
          />
        </div>
      </section>
    </div>
  );
}
