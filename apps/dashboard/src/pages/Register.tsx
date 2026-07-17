import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthField, AuthLayout, AuthSubmit } from '@/components/common/AuthLayout';
import { useAuthStore } from '@/stores/auth';
import { ApiClientError } from '@/api/client';

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      title="Create account"
      subtitle="Spin up a NexusDesk organization in minutes"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void register({ email, password, displayName, organizationName })
            .then(() => navigate('/', { replace: true }))
            .catch((err: unknown) => {
              setError(err instanceof ApiClientError ? err.message : 'Unable to register');
            });
        }}
      >
        <AuthField
          label="Full name"
          id="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <AuthField
          label="Organization"
          id="orgName"
          required
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
        />
        <AuthField
          label="Work email"
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AuthSubmit loading={loading}>Create account</AuthSubmit>
      </form>
    </AuthLayout>
  );
}
