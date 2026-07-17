process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://nexusdesk:nexusdesk@localhost:5432/nexusdesk';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-characters-long!!';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-characters-long!';
process.env.SESSION_SECRET ??= 'test-session-secret-min-32-characters-long!';
process.env.ENCRYPTION_KEY ??= 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
process.env.AGENT_ENROLLMENT_SECRET ??= 'test-agent-enrollment-secret!!';
process.env.INTERNAL_API_TOKEN ??= 'test-internal-api-token-min-32-chars!';
