import { prisma } from './prisma.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

const DEFAULT_CATEGORIES = ['Tenda', 'Carrier', 'Alat Masak', 'Lainnya'];

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function toItemDto(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category?.name || item.categoryName || '',
    stock: item.stock,
    price: item.price,
    image: item.image || '',
  };
}

function toRentalDto(rental) {
  return {
    id: rental.id,
    customerId: rental.customerId || undefined,
    customer: {
      name: rental.customerName,
      phone: rental.customerPhone,
      guarantee: rental.guarantee,
      guaranteeOther: rental.guaranteeOther || '',
      idNumber: rental.idNumber || '',
    },
    items: rental.items.map((item) => ({
      id: item.itemId,
      name: item.itemName,
      category: item.categoryName,
      price: item.price,
      qty: item.qty,
      notes: item.notes || '',
    })),
    duration: rental.duration,
    total: rental.total,
    status: rental.status,
    date: rental.date.toISOString(),
    returnDate: rental.returnDate ? rental.returnDate.toISOString() : undefined,
    returnNotes: rental.returnNotes || '',
    additionalFee: rental.additionalFee,
    finalTotal: rental.finalTotal ?? undefined,
  };
}

function toReturnDto(returnRecord) {
  return {
    id: returnRecord.id,
    rentalId: returnRecord.rentalId,
    customer: {
      name: returnRecord.customerName,
      phone: returnRecord.customerPhone,
    },
    items: Array.isArray(returnRecord.itemsJson) ? returnRecord.itemsJson : [],
    returnDate: returnRecord.returnDate.toISOString(),
    returnNotes: returnRecord.returnNotes || '',
    additionalFee: returnRecord.additionalFee,
    finalTotal: returnRecord.finalTotal,
  };
}

function toCustomerDto(customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address || '',
    guarantee: customer.guarantee,
    guaranteeOther: customer.guaranteeOther || '',
    idNumber: customer.idNumber || '',
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export async function initDatabase(env) {
  await prisma.$connect();

  await prisma.$transaction(async (tx) => {
    for (const categoryName of DEFAULT_CATEGORIES) {
      await tx.category.upsert({
        where: { name: categoryName },
        update: {},
        create: { name: categoryName },
      });
    }

    await tx.user.upsert({
      where: { username: env.adminUsername },
      update: {
        role: 'admin',
      },
      create: {
        username: env.adminUsername,
        passwordHash: hashPassword(env.adminPassword, env.passwordPepper),
        role: 'admin',
      },
    });
  });
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
  });

  return categories.map((category) => category.name);
}

export async function createCategory(name) {
  const normalized = String(name || '').trim();
  if (!normalized) {
    throw new Error('Category name is required');
  }

  const exists = await prisma.category.findFirst({
    where: {
      name: {
        equals: normalized,
        mode: 'insensitive',
      },
    },
  });

  if (exists) {
    throw new Error('Category already exists');
  }

  const created = await prisma.category.create({
    data: { name: normalized },
  });

  return created.name;
}

export async function deleteCategory(name) {
  const normalized = String(name || '').trim();

  const existing = await prisma.category.findFirst({
    where: {
      name: {
        equals: normalized,
        mode: 'insensitive',
      },
    },
  });

  if (!existing) {
    throw new Error('Category not found');
  }

  const itemCount = await prisma.item.count({
    where: { categoryId: existing.id },
  });

  if (itemCount > 0) {
    throw new Error('Category is used by existing items');
  }

  await prisma.category.delete({
    where: { id: existing.id },
  });

  return existing.name;
}

export async function listItems() {
  const items = await prisma.item.findMany({
    include: { category: true },
    orderBy: { createdAt: 'asc' },
  });

  return items.map(toItemDto);
}

export async function createItem(payload) {
  const name = String(payload?.name || '').trim();
  const categoryName = String(payload?.category || '').trim();
  const stock = Number(payload?.stock);
  const price = Number(payload?.price);

  if (!name) {
    throw new Error('Item name is required');
  }

  if (!categoryName) {
    throw new Error('Item category is required');
  }

  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error('Stock must be a number >= 0');
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Price must be a number >= 0');
  }

  const category = await prisma.category.findFirst({
    where: {
      name: {
        equals: categoryName,
        mode: 'insensitive',
      },
    },
  });

  if (!category) {
    throw new Error('Category does not exist');
  }

  const item = await prisma.item.create({
    data: {
      ...(payload?.id ? { id: String(payload.id) } : {}),
      name,
      categoryId: category.id,
      stock,
      price,
      image: payload?.image || '',
    },
    include: { category: true },
  });

  return toItemDto(item);
}

export async function updateItem(id, payload) {
  const targetId = String(id);

  const existing = await prisma.item.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('Item not found');
  }

  const name = String(payload?.name || '').trim();
  const categoryName = String(payload?.category || '').trim();
  const stock = Number(payload?.stock);
  const price = Number(payload?.price);

  if (!name) {
    throw new Error('Item name is required');
  }

  if (!categoryName) {
    throw new Error('Item category is required');
  }

  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error('Stock must be a number >= 0');
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Price must be a number >= 0');
  }

  const category = await prisma.category.findFirst({
    where: {
      name: {
        equals: categoryName,
        mode: 'insensitive',
      },
    },
  });

  if (!category) {
    throw new Error('Category does not exist');
  }

  const updated = await prisma.item.update({
    where: { id: targetId },
    data: {
      name,
      categoryId: category.id,
      stock,
      price,
      image: payload?.image || '',
    },
    include: { category: true },
  });

  return toItemDto(updated);
}

export async function deleteItem(id) {
  const targetId = String(id);

  const existing = await prisma.item.findUnique({
    where: { id: targetId },
    include: { category: true },
  });

  if (!existing) {
    throw new Error('Item not found');
  }

  const activeUsageCount = await prisma.rentalItem.count({
    where: {
      itemId: targetId,
      rental: {
        status: 'Active',
      },
    },
  });

  if (activeUsageCount > 0) {
    throw new Error('Item is used by active rentals');
  }

  await prisma.item.delete({
    where: { id: targetId },
  });

  return toItemDto(existing);
}

export async function listRentals({ status } = {}) {
  const rentals = await prisma.rental.findMany({
    where: status ? { status } : undefined,
    include: {
      items: true,
    },
    orderBy: { date: 'asc' },
  });

  return rentals.map(toRentalDto);
}

export async function createRental(payload) {
  const customer = payload?.customer || {};
  const customerName = String(customer.name || '').trim();
  const customerPhone = String(customer.phone || '').trim();
  const customerAddress = String(customer.address || '').trim();
  const guarantee = String(customer.guarantee || 'KTP').trim() || 'KTP';
  const guaranteeOther = guarantee === 'Lainnya' ? String(customer.guaranteeOther || '').trim() : '';
  const rawIdNumber = String(customer.idNumber || '').trim();
  const hasExplicitIdNumber = rawIdNumber !== '' && rawIdNumber !== '0';
  const customerIdNumber = hasExplicitIdNumber ? rawIdNumber : null;
  const rentalIdNumber = hasExplicitIdNumber ? rawIdNumber : `RNDM-${Math.floor(100000 + Math.random() * 900000)}`;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const duration = Number(payload?.duration);

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (!Number.isFinite(duration) || duration < 1) {
    throw new Error('Duration must be a number >= 1');
  }

  if (items.length === 0) {
    throw new Error('Rental items are required');
  }

  const rental = await prisma.$transaction(async (tx) => {
    const customerRecord = await tx.customer.upsert({
      where: { phone: customerPhone },
      update: {
        name: customerName,
        ...(customerAddress ? { address: customerAddress } : {}),
        guarantee,
        guaranteeOther,
        ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
      },
      create: {
        name: customerName,
        phone: customerPhone,
        ...(customerAddress ? { address: customerAddress } : {}),
        guarantee,
        guaranteeOther,
        ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
      },
    });

    const normalizedItems = [];

    for (const inputItem of items) {
      const item = await tx.item.findUnique({
        where: { id: String(inputItem.id) },
        include: { category: true },
      });

      const qty = Number(inputItem.qty);

      if (!item) {
        throw new Error(`Item ${inputItem.id} not found`);
      }

      if (!Number.isFinite(qty) || qty < 1) {
        throw new Error(`Invalid qty for item ${inputItem.id}`);
      }

      if (qty > item.stock) {
        throw new Error(`Insufficient stock for ${item.name}`);
      }

      await tx.item.update({
        where: { id: item.id },
        data: { stock: item.stock - qty },
      });

      normalizedItems.push({
        itemId: item.id,
        itemName: item.name,
        categoryName: item.category.name,
        price: item.price,
        qty,
        notes: inputItem.notes || '',
      });
    }

    const total = normalizedItems.reduce((sum, item) => sum + (item.price * item.qty * duration), 0);

    return tx.rental.create({
      data: {
        id: payload?.id || createId('TX'),
        customerId: customerRecord.id,
        customerName,
        customerPhone,
        guarantee,
        guaranteeOther,
        idNumber: rentalIdNumber,
        duration,
        total,
        status: 'Active',
        items: {
          create: normalizedItems,
        },
      },
      include: {
        items: true,
      },
    });
  });

  return toRentalDto(rental);
}

export async function listReturns() {
  const records = await prisma.returnRecord.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return records.map(toReturnDto);
}

export async function getSchemaSummary() {
  const [categoriesCount, itemsCount, rentalsCount, returnsCount, customersCount] = await prisma.$transaction([
    prisma.category.count(),
    prisma.item.count(),
    prisma.rental.count(),
    prisma.returnRecord.count(),
    prisma.customer.count(),
  ]);

  return {
    tables: {
      categories: {
        type: 'Category',
        count: categoriesCount,
      },
      items: {
        type: 'Item',
        count: itemsCount,
        requiredFields: ['id', 'name', 'categoryId', 'stock', 'price'],
      },
      rentals: {
        type: 'Rental',
        count: rentalsCount,
        requiredFields: ['id', 'customerName', 'customerPhone', 'duration', 'total', 'status', 'date'],
      },
      returns: {
        type: 'ReturnRecord',
        count: returnsCount,
        requiredFields: ['id', 'rentalId', 'itemsJson', 'returnDate', 'additionalFee', 'finalTotal'],
      },
      customers: {
        type: 'Customer',
        count: customersCount,
        requiredFields: ['id', 'name', 'phone'],
      },
      users: {
        type: 'User',
      },
    },
    relations: [
      'items.categoryId -> categories.id',
      'rental_items.rentalId -> rentals.id',
      'rental_items.itemId -> items.id',
      'return_records.rentalId -> rentals.id',
      'rentals.customerId -> customers.id',
    ],
  };
}

export async function listCustomers({ query } = {}) {
  const keyword = String(query || '').trim();

  const customers = await prisma.customer.findMany({
    where: keyword
      ? {
          OR: [
            {
              name: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
            {
              phone: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
            {
              idNumber: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
            {
              address: {
                contains: keyword,
                mode: 'insensitive',
              },
            },
          ],
        }
      : undefined,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: keyword ? 20 : 100,
  });

  return customers.map(toCustomerDto);
}

export async function upsertCustomer(payload) {
  const customer = payload || {};
  const customerName = String(customer.name || '').trim();
  const customerPhone = String(customer.phone || '').trim();
  const customerAddress = String(customer.address || '').trim();
  const guarantee = String(customer.guarantee || 'KTP').trim() || 'KTP';
  const guaranteeOther = guarantee === 'Lainnya' ? String(customer.guaranteeOther || '').trim() : '';
  const rawIdNumber = String(customer.idNumber || '').trim();
  const hasExplicitIdNumber = rawIdNumber !== '' && rawIdNumber !== '0';
  const customerIdNumber = hasExplicitIdNumber ? rawIdNumber : null;

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (guarantee === 'Lainnya' && !guaranteeOther) {
    throw new Error('guaranteeOther is required when guarantee is Lainnya');
  }

  const savedCustomer = await prisma.customer.upsert({
    where: { phone: customerPhone },
    update: {
      name: customerName,
      ...(customerAddress ? { address: customerAddress } : {}),
      guarantee,
      guaranteeOther,
      ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
    },
    create: {
      name: customerName,
      phone: customerPhone,
      ...(customerAddress ? { address: customerAddress } : {}),
      guarantee,
      guaranteeOther,
      ...(customerIdNumber ? { idNumber: customerIdNumber } : {}),
    },
  });

  return toCustomerDto(savedCustomer);
}

export async function updateCustomerById(customerId, payload) {
  const targetId = String(customerId || '').trim();
  if (!targetId) {
    throw new Error('Customer id is required');
  }

  const existing = await prisma.customer.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('Customer not found');
  }

  const customer = payload || {};
  const customerName = String(customer.name || '').trim();
  const customerPhone = String(customer.phone || '').trim();
  const customerAddress = String(customer.address || '').trim();
  const guarantee = String(customer.guarantee || 'KTP').trim() || 'KTP';
  const guaranteeOther = guarantee === 'Lainnya' ? String(customer.guaranteeOther || '').trim() : '';
  const rawIdNumber = String(customer.idNumber || '').trim();
  const hasExplicitIdNumber = rawIdNumber !== '' && rawIdNumber !== '0';
  const customerIdNumber = hasExplicitIdNumber ? rawIdNumber : null;

  if (!customerName) {
    throw new Error('Customer name is required');
  }

  if (!customerPhone) {
    throw new Error('Customer phone is required');
  }

  if (guarantee === 'Lainnya' && !guaranteeOther) {
    throw new Error('guaranteeOther is required when guarantee is Lainnya');
  }

  if (customerPhone !== existing.phone) {
    const phoneOwner = await prisma.customer.findUnique({
      where: { phone: customerPhone },
    });

    if (phoneOwner) {
      throw new Error('Customer phone already exists');
    }
  }

  const updatedCustomer = await prisma.customer.update({
    where: { id: targetId },
    data: {
      name: customerName,
      phone: customerPhone,
      address: customerAddress || null,
      guarantee,
      guaranteeOther,
      idNumber: customerIdNumber,
    },
  });

  return toCustomerDto(updatedCustomer);
}

export async function deleteCustomerById(customerId) {
  const targetId = String(customerId || '').trim();
  if (!targetId) {
    throw new Error('Customer id is required');
  }

  const existing = await prisma.customer.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('Customer not found');
  }

  await prisma.customer.delete({
    where: { id: targetId },
  });

  return toCustomerDto(existing);
}

export async function processReturn(payload) {
  const rentalId = String(payload?.rentalId || '').trim();
  const additionalFee = Number(payload?.additionalFee || 0);

  if (!rentalId) {
    throw new Error('rentalId is required');
  }

  if (!Number.isFinite(additionalFee) || additionalFee < 0) {
    throw new Error('additionalFee must be a number >= 0');
  }

  const result = await prisma.$transaction(async (tx) => {
    const rental = await tx.rental.findUnique({
      where: { id: rentalId },
      include: { items: true },
    });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (rental.status === 'Returned') {
      throw new Error('Rental already returned');
    }

    for (const rentalItem of rental.items) {
      const item = await tx.item.findUnique({ where: { id: rentalItem.itemId } });
      if (item) {
        await tx.item.update({
          where: { id: item.id },
          data: { stock: item.stock + rentalItem.qty },
        });
      }
    }

    const returnDate = new Date();
    const returnNotes = payload?.returnNotes || '';
    const finalTotal = rental.total + additionalFee;

    const updatedRental = await tx.rental.update({
      where: { id: rental.id },
      data: {
        status: 'Returned',
        returnDate,
        returnNotes,
        additionalFee,
        finalTotal,
      },
      include: {
        items: true,
      },
    });

    const returnRecord = await tx.returnRecord.create({
      data: {
        id: createId('RT'),
        rentalId: rental.id,
        customerName: rental.customerName,
        customerPhone: rental.customerPhone,
        itemsJson: rental.items,
        returnDate,
        returnNotes,
        additionalFee,
        finalTotal,
      },
    });

    return {
      rental: toRentalDto(updatedRental),
      returnRecord: toReturnDto(returnRecord),
    };
  });

  return result;
}

export async function findUserByUsername(username) {
  return prisma.user.findUnique({
    where: { username },
  });
}

export async function findUserById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function rehashUserPassword(userId, plainPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash: hashPassword(plainPassword, passwordPepper),
    },
  });
}

function toUserDto(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return users.map(toUserDto);
}

export async function createUser(payload, passwordPepper) {
  const normalizedUsername = String(payload.username || '').trim().toLowerCase();
  const role = payload.role || 'kasir';
  const password = String(payload.password || '');

  if (!normalizedUsername) {
    throw new Error('Username is required');
  }

  if (!password) {
    throw new Error('Password is required');
  }

  const existing = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  if (existing) {
    throw new Error('Username already exists');
  }

  const created = await prisma.user.create({
    data: {
      username: normalizedUsername,
      passwordHash: hashPassword(password, passwordPepper),
      role,
    },
  });

  return toUserDto(created);
}

export async function updateUserByAdmin(userId, payload) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  const normalizedUsername = String(payload?.username || '').trim().toLowerCase();
  const role = String(payload?.role || '').trim();

  if (!normalizedUsername) {
    throw new Error('Username is required');
  }

  if (!role) {
    throw new Error('Role is required');
  }

  if (normalizedUsername !== existing.username) {
    const usernameOwner = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (usernameOwner) {
      throw new Error('Username already exists');
    }
  }

  if (existing.role === 'admin' && role !== 'admin') {
    const adminCount = await prisma.user.count({
      where: { role: 'admin' },
    });
    if (adminCount <= 1) {
      throw new Error('At least one admin account is required');
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: {
      username: normalizedUsername,
      role,
    },
  });

  return toUserDto(updated);
}

export async function changeUserPasswordByAdmin(userId, newPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash: hashPassword(newPassword, passwordPepper),
    },
  });

  return { updated: true };
}

export async function changeOwnPassword(userId, currentPassword, newPassword, passwordPepper) {
  const targetId = String(userId || '').trim();
  if (!targetId) {
    throw new Error('User id is required');
  }

  const existing = await prisma.user.findUnique({
    where: { id: targetId },
  });

  if (!existing) {
    throw new Error('User not found');
  }

  const validCurrentPassword = verifyPassword(currentPassword, existing.passwordHash, passwordPepper);
  if (!validCurrentPassword) {
    throw new Error('Current password is incorrect');
  }

  await prisma.user.update({
    where: { id: targetId },
    data: {
      passwordHash: hashPassword(newPassword, passwordPepper),
    },
  });

  return { updated: true };
}
