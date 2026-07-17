import { useState } from 'react';
import { Button, Card, Input } from '@nexusdesk/ui';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function App() {
  const [email, setEmail] = useState('admin@nexusdesk.local');
  const [password, setPassword] = useState('Admin123!');
  const [token, setToken] = useState<string | null>(null);
  const [devices, setDevices] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setError(null);
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError(`Login failed (${res.status})`);
      return;
    }
    const data = (await res.json()) as {
      tokens?: { accessToken: string };
      user?: { organizationId: string };
    };
    const access = data.tokens?.accessToken;
    if (!access) {
      setError('MFA required or invalid response');
      return;
    }
    setToken(access);
    await window.nexusdesk?.setSecret('accessToken', access);
    const orgId = data.user?.organizationId;
    if (orgId) {
      const list = await fetch(`${API_URL}/organizations/${orgId}/devices`, {
        headers: { authorization: `Bearer ${access}` },
      });
      if (list.ok) {
        const payload = (await list.json()) as { items: Array<{ id: string; name: string; status: string }> };
        setDevices(payload.items ?? []);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#0f766e33,_#020617_55%)] p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="font-display text-3xl font-semibold tracking-tight text-teal-300">NexusDesk</p>
          <p className="mt-1 text-sm text-slate-400">Secure remote access for your fleet</p>
        </header>

        {!token ? (
          <Card className="max-w-md space-y-4 border-white/10 bg-white/5 p-6 backdrop-blur">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            <Button onClick={() => void login()}>Sign in</Button>
          </Card>
        ) : (
          <Card className="border-white/10 bg-white/5 p-6 backdrop-blur">
            <h2 className="mb-4 text-lg font-medium text-slate-100">Devices</h2>
            <ul className="space-y-2">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3"
                >
                  <span>{device.name}</span>
                  <span className="text-xs uppercase tracking-wide text-teal-300">{device.status}</span>
                </li>
              ))}
              {devices.length === 0 ? (
                <li className="text-sm text-slate-400">No devices yet. Enroll an agent to get started.</li>
              ) : null}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

declare global {
  interface Window {
    nexusdesk?: {
      setSecret: (key: string, value: string) => Promise<{ ok: boolean }>;
      getSecret: (key: string) => Promise<string | null>;
    };
  }
}
