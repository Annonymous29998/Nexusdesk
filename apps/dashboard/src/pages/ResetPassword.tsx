import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthField, AuthLayout, AuthSubmit } from '@/components/common/AuthLayout';
import { resetPassword } from '@/api/auth';
import { ApiClientError } from '@/api/client';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get('token') ?? 'demo-reset-token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Use at least 8 characters"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) {
            setError('Passwords do not match');
            return;
          }
          setLoading(true);
          setError(null);
          void resetPassword(token, password)
            .then(() => navigate('/login', { replace: true }))
            .catch((err: unknown) => {
              setError(err instanceof ApiClientError ? err.message : 'Reset failed');
            })
            .finally(() => setLoading(false));
        }}
      >
        <AuthField
          label="Reset token"
          id="token"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <AuthField
          label="New password"
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          label="Confirm password"
          id="confirm"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AuthSubmit loading={loading}>Update password</AuthSubmit>
      </form>
    </AuthLayout>
  );
}
