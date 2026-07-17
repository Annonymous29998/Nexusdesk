# Database

PostgreSQL schema is managed by Prisma (`apps/api/prisma/schema.prisma`).

## Core entities

```
Organization 1──* OrganizationMember *──1 User
Organization 1──* Device 1──* RemoteSession *──* RemoteConnection
User 1──* AuthSession / RefreshToken / TwoFactorSecret
Organization 1──* Invitation / ApiKey / Notification / AuditLog / ActivityLog
Device 1──* DeviceToken / DeviceCredential
```

## Indexes

Hot paths are indexed on `organizationId`, device/session `status`, `email`, `createdAt`, and token hashes.

## Migrations

```bash
cd apps/api
npx prisma migrate dev
npx prisma migrate deploy   # production
npm run prisma:seed
```
