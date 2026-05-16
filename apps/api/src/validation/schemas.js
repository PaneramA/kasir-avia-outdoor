import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  address: z.string().trim().optional().default(''),
  guarantee: z.string().trim().min(1).default('KTP'),
  guaranteeOther: z.string().trim().optional().default(''),
  idNumber: z.string().trim().optional().default(''),
});

const rentalItemSchema = z.object({
  id: z.string().trim().min(1),
  qty: z.coerce.number().int().min(1),
  notes: z.string().trim().optional().default(''),
});

const rentalPaymentSchema = z.object({
  status: z.enum(['DP', 'LUNAS']).default('LUNAS'),
  method: z.enum(['QRIS', 'BANK', 'TUNAI']).default('TUNAI'),
  paidAmount: z.coerce.number().int().min(0).optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const selfRegisterSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(128),
  storeName: z.string().trim().min(2).max(120),
  storeSlug: z.string().trim().min(2).max(80).optional(),
  initialBranchCode: z.string().trim().min(2).max(40).optional(),
  initialBranchName: z.string().trim().min(2).max(120).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1),
});

export const createItemSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  stock: z.coerce.number().int().min(0),
  price: z.coerce.number().int().min(0),
  image: z.string().optional().default(''),
  id: z.string().trim().min(1).optional(),
});

export const updateItemSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  stock: z.coerce.number().int().min(0),
  price: z.coerce.number().int().min(0),
  image: z.string().optional().default(''),
});

export const updateTenantSettingsSchema = z.object({
  storeName: z.string().trim().min(1).max(120).optional(),
  addressLines: z.array(z.string().trim().min(1).max(160)).max(6).optional(),
  phone: z.string().trim().max(40).optional(),
  legalFooterLines: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['active', 'suspended']).optional().default('active'),
  ownerUserId: z.string().trim().min(1).optional(),
  initialBranchCode: z.string().trim().min(2).max(40).optional(),
  initialBranchName: z.string().trim().min(2).max(120).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const createBranchSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  status: z.enum(['active', 'inactive']).optional().default('active'),
});

export const updateBranchSchema = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const updateBranchSettingsSchema = z.object({
  storeName: z.string().trim().max(120).optional(),
  addressLines: z.array(z.string().trim().min(1).max(160)).max(6).optional(),
  phone: z.string().trim().max(40).optional(),
  legalFooterLines: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
});

const membershipRoleSchema = z.enum(['owner', 'admin', 'kasir']);
const membershipStatusSchema = z.enum(['active', 'inactive']);

export const upsertTenantMembershipSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1),
  role: membershipRoleSchema.default('kasir'),
  status: membershipStatusSchema.default('active'),
});

export const updateTenantMembershipSchema = z.object({
  role: membershipRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
}).refine((payload) => (
  typeof payload.role === 'string' || typeof payload.status === 'string'
), {
  message: 'At least one field is required',
});

export const upsertBranchAccessSchema = z.object({
  tenantId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1),
  branchId: z.string().trim().min(1),
  role: z.enum(['admin', 'kasir']).default('kasir'),
});

export const createRentalSchema = z.object({
  customer: customerSchema,
  items: z.array(rentalItemSchema).min(1),
  duration: z.coerce.number().int().min(1),
  payment: rentalPaymentSchema.optional(),
  id: z.string().trim().min(1).optional(),
});

export const createCustomerSchema = customerSchema;
export const updateCustomerSchema = customerSchema;

export const processReturnSchema = z.object({
  rentalId: z.string().trim().min(1),
  additionalFee: z.coerce.number().int().min(0).default(0),
  returnNotes: z.string().trim().optional().default(''),
});

export const verifyRentalDeleteSchema = z.object({
  password: z.string().min(1).max(128),
});

export const deleteRentalByAdminSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  confirmationText: z.string().trim().min(1).max(200),
});

const userRoleSchema = z.enum(['admin', 'superuser', 'kasir']);

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(128),
  role: userRoleSchema.default('kasir'),
});

export const updateUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  role: userRoleSchema,
});

export const createTenantUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(128),
  tenantRole: z.enum(['admin', 'kasir']).default('kasir'),
  tenantId: z.string().trim().min(1).optional(),
});

export const adminChangePasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

export const selfChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
