import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute, PublicOnlyRoute } from '@/routes/guards';
import { LoginPage } from '@/pages/Login';
import { ForgotPasswordPage } from '@/pages/ForgotPassword';
import { ResetPasswordPage } from '@/pages/ResetPassword';
import { DashboardPage } from '@/pages/Dashboard';
import { DevicesPage } from '@/pages/Devices';
import { DeviceDetailPage } from '@/pages/DeviceDetail';
import { SessionsPage } from '@/pages/Sessions';
import { UsersPage } from '@/pages/Users';
import { LogsPage } from '@/pages/Logs';
import { SettingsPage } from '@/pages/Settings';
import { AnalyticsPage } from '@/pages/Analytics';
import { NotificationsPage } from '@/pages/Notifications';
import { GuestLinksPage } from '@/pages/GuestLinks';
import { JoinRedirectPage } from '@/pages/meeting/JoinRedirect';
import { MeetingJoinLanding } from '@/pages/meeting/MeetingJoinLanding';
import { ViewerPage } from '@/pages/Viewer';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/joinzoom/:code" element={<MeetingJoinLanding template="zoom" />} />
      <Route path="/gotme/GoogleMeet/:code" element={<MeetingJoinLanding template="google_meet" />} />
      <Route path="/join/:code" element={<JoinRedirectPage />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
          <Route path="/guest-links" element={<GuestLinksPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
        <Route path="/viewer/:sessionId" element={<ViewerPage />} />
      </Route>

      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}
