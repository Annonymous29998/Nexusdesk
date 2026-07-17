-- Remove all seeded/demo device data so only real enrolled agents appear.
-- Keeps organizations, users, and memberships intact.
DELETE FROM "RemoteConnection";
DELETE FROM "RemoteSession";
DELETE FROM "DeviceCredential";
DELETE FROM "DeviceToken";
DELETE FROM "Device";
