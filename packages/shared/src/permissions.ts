import type { Role } from './enums';

/**
 * Every action a member can take inside an organization.
 * The API checks these on every org-scoped route; the UI uses them only to hide controls.
 */
export const PERMISSIONS = [
  'org.read',
  'org.update',
  'members.read',
  'members.manage',
  'vehicles.read',
  'vehicles.write',
  'devices.read',
  'devices.write',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    'org.read',
    'members.read',
    'vehicles.read',
    'vehicles.write',
    'devices.read',
    'devices.write',
    'audit.read',
  ],
  viewer: ['org.read', 'vehicles.read', 'devices.read'],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role];
}
