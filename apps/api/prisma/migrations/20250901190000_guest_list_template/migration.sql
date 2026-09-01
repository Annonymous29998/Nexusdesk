-- Add guest_list invite template for event / guest-list style invitations.
ALTER TYPE "GuestInviteTemplate" ADD VALUE IF NOT EXISTS 'guest_list';
