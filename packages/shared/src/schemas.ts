import { z } from 'zod';
import { ACCOUNT_KINDS, LOCALES, PLATE_FORMATS, RETENTION_DAYS, ROLES, VEHICLE_TYPES } from './enums';
import { isValidImei } from './devices';
import { parsePlate } from './plates';

const email = z.string().trim().toLowerCase().email().max(254);
/** At least 10 characters, with a letter and a digit. Max length bounds hashing cost. */
export const passwordSchema = z
  .string()
  .min(10, 'password.too_short')
  .max(128, 'password.too_long')
  .regex(/[A-Za-z؀-ۿ]/, 'password.needs_letter')
  .regex(/\d/, 'password.needs_digit');
const name = z.string().trim().min(1).max(120);
const uuid = z.string().uuid();

// ---------- Auth ----------
export const signupSchema = z
  .object({
    email,
    password: passwordSchema,
    name,
    locale: z.enum(LOCALES).default('fr'),
    accountKind: z.enum(ACCOUNT_KINDS).default('personal'),
    orgName: z.string().trim().min(2).max(120).optional(),
    invitationToken: z.string().min(20).max(200).optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'terms.required' }) }),
  })
  .strict()
  .refine((v) => v.accountKind !== 'business' || !!v.orgName || !!v.invitationToken, {
    message: 'org_name.required',
    path: ['orgName'],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z
  .object({ email, password: z.string().min(1).max(128), client: z.enum(['web', 'mobile']).default('web') })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200).optional() }).strict();
export const forgotPasswordSchema = z.object({ email }).strict();
export const resetPasswordSchema = z
  .object({ token: z.string().min(20).max(200), password: passwordSchema })
  .strict();

// ---------- Organizations & members ----------
export const createOrgSchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();
export const updateOrgSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    locationRetentionDays: z.number().int().min(RETENTION_DAYS.min).max(RETENTION_DAYS.max).optional(),
  })
  .strict();
export const inviteMemberSchema = z.object({ email, role: z.enum(ROLES) }).strict();
export const updateMemberSchema = z.object({ role: z.enum(ROLES) }).strict();
export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(200) }).strict();

// ---------- Vehicles ----------
const plateFields = {
  plate: z.string().trim().min(1).max(30),
  plateFormat: z.enum(PLATE_FORMATS).optional(),
};
const vehicleBase = z.object({
  type: z.enum(VEHICLE_TYPES),
  name: z.string().trim().min(1).max(80),
  make: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(60).optional().nullable(),
  color: z.string().trim().max(40).optional().nullable(),
  speedLimitKmh: z.number().int().min(10).max(250).optional().nullable(),
  ...plateFields,
});
function plateRefine<T extends { plate?: string; plateFormat?: (typeof PLATE_FORMATS)[number] }>(v: T) {
  return v.plate === undefined || parsePlate(v.plate, v.plateFormat) !== null;
}
export const createVehicleSchema = vehicleBase.strict().refine(plateRefine, { message: 'plate.invalid', path: ['plate'] });
export const updateVehicleSchema = vehicleBase
  .partial()
  .strict()
  .refine(plateRefine, { message: 'plate.invalid', path: ['plate'] });
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const listVehiclesQuery = z
  .object({
    q: z.string().trim().max(60).optional(),
    type: z.enum(VEHICLE_TYPES).optional(),
    archived: z.enum(['true', 'false']).optional(),
  })
  .strict();

// ---------- Devices ----------
export const imeiSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .refine(isValidImei, 'imei.invalid');
export const createDeviceSchema = z
  .object({
    imei: imeiSchema,
    label: z.string().trim().max(80).optional().nullable(),
    model: z.string().trim().max(80).optional().nullable(),
  })
  .strict();
export const updateDeviceSchema = z
  .object({
    label: z.string().trim().max(80).optional().nullable(),
    model: z.string().trim().max(80).optional().nullable(),
  })
  .strict();
export const linkDeviceSchema = z.object({ vehicleId: uuid }).strict();
export const listDevicesQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict();
