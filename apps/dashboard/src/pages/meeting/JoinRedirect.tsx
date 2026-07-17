import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { fetchPublicGuestLink } from '@/api/guest-links';
import { buildGuestJoinUrl, normalizeInviteTemplate } from '@/lib/guest-invite';
import { applyMeetingPageBranding } from '@/lib/meeting-branding';
import './meeting-join.css';

/** Legacy /join/:code → template-specific path */
export function JoinRedirectPage() {
  const { code = '' } = useParams();
  const query = useQuery({
    queryKey: ['guest-public', code, 'redirect'],
    enabled: Boolean(code),
    queryFn: () => fetchPublicGuestLink(code),
    retry: 1,
  });

  const template = normalizeInviteTemplate(query.data?.inviteTemplate);

  useEffect(() => {
    document.body.classList.add('meeting-guest-page');
    return () => document.body.classList.remove('meeting-guest-page');
  }, []);

  useEffect(() => {
    const phase = query.isLoading ? 'loading' : 'ready';
    return applyMeetingPageBranding(template, phase);
  }, [template, query.isLoading]);

  if (query.isLoading) {
    return (
      <div className="meeting-loader">
        <div className="meeting-loader__spin" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="meeting-error">
        This meeting link is invalid, expired, or no longer available.
      </div>
    );
  }

  const target = buildGuestJoinUrl(window.location.origin, code, template);
  const path = new URL(target).pathname;
  return <Navigate to={path} replace />;
}
