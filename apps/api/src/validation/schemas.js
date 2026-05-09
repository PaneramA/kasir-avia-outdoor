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

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
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

export const createRentalSchema = z.object({
  customer: customerSchema,
  items: z.array(rentalItemSchema).min(1),
  duration: z.coerce.number().int().min(1),
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

export const adminChangePasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

export const selfChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});
