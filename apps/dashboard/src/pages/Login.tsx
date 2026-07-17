import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthField, AuthLayout, AuthSubmit } from '@/components/common/AuthLayout';
import { useAuthStore } from '@/stores/auth';
import { ApiClientError } from '@/api/client';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your organization control panel"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void login(email, password)
            .then(() => navigate(from, { replace: true }))
            .catch((err: unknown) => {
              setError(err instanceof ApiClientError ? err.message : 'Unable to sign in');
            });
        }}
      >
        <AuthField
          label="Email"
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AuthSubmit loading={loading}>Sign in</AuthSubmit>
        <div className="text-center text-sm">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-primary">
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
