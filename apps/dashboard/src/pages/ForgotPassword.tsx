import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthField, AuthLayout, AuthSubmit } from '@/components/common/AuthLayout';
import { forgotPassword } from '@/api/auth';
import { ApiClientError } from '@/api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll email you a secure reset link"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-nd bg-accent/10 px-3 py-2 text-accent">
            If an account exists for {email}, a reset link is on its way.
          </p>
          <Link to="/reset-password" className="inline-block text-primary hover:underline">
            Continue to reset form
          </Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            void forgotPassword(email)
              .then(() => setSent(true))
              .catch((err: unknown) => {
                setError(err instanceof ApiClientError ? err.message : 'Request failed');
              })
              .finally(() => setLoading(false));
          }}
        >
          <AuthField
            label="Email"
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AuthSubmit loading={loading}>Send reset link</AuthSubmit>
        </form>
      )}
    </AuthLayout>
  );
}
