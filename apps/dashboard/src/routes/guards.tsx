import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from '@nexusdesk/ui';
import { getStoredTokens } from '@/api/client';
import { useAuthStore } from '@/stores/auth';

export function ProtectedRoute() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const hasTokens = Boolean(getStoredTokens());

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user || !hasTokens) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (user && getStoredTokens()) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
