import { ZodError } from 'zod';
import {
  changeOwnPassword,
  changeUserPasswordByAdmin,
  createCategory,
  createItem,
  createRental,
  createUser,
  deleteCategory,
  deleteItem,
  findUserById,
  findUserByUsername,
  getSchemaSummary,
  listCategories,
  listCustomers,
  listItems,
  listRentals,
  listReturns,
  listUsers,
  processReturn,
  updateUserByAdmin,
  updateItem,
} from '../data/db.js';
import { createAccessToken, verifyAccessToken } from '../auth/jwt.js';
import { verifyPassword } from '../auth/password.js';
import {
  adminChangePasswordSchema,
  createCategorySchema,
  createItemSchema,
  createUserSchema,
  createRentalSchema,
  loginSchema,
  processReturnSchema,
  selfChangePasswordSchema,
  updateUserSchema,
  updateItemSchema,
} from '../validation/schemas.js';
import { parsePath, readJsonBody, sendJson } from '../utils/http.js';

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    message,
    ...(details ? { details } : {}),
  });
}

function sendSuccess(res, statusCode, data) {
  sendJson(res, statusCode, {
    ok: true,
    data,
  });
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice('Bearer '.length).trim();
}

function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

function shouldSkipAuth(pathname) {
  return pathname === '/api/auth/login';
}

async function authenticateRequest(req, env) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Unauthorized');
  }

  const decoded = verifyAccessToken(token, env);
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Unauthorized');
  }

  if (
    typeof decoded.sub !== 'string' ||
    typeof decoded.username !== 'string' ||
    typeof decoded.role !== 'string'
  ) {
    throw new Error('Unauthorized');
  }

  const user = await findUserById(decoded.sub);
  if (!user) {
    throw new Error('Unauthorized');
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}

export async function apiRoute(req, res, env) {
  const { pathname, searchParams } = parsePath(req);
  let authUser = null;

  const ensureAuth = async () => {
    if (authUser) {
      return authUser;
    }

    authUser = await authenticateRequest(req, env);
    return authUser;
  };

  const ensureAdmin = async () => {
    const user = await ensureAuth();
    if (user.role !== 'admin') {
      throw new Error('Forbidden');
    }

    return user;
  };

  try {
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      const body = loginSchema.parse(await readJsonBody(req));
      const user = await findUserByUsername(body.username.trim().toLowerCase());

      if (!user || !verifyPassword(body.password, user.passwordHash, env.passwordPepper)) {
        sendError(res, 401, 'Invalid username or password');
        return true;
      }

      const token = createAccessToken(
        {
          sub: user.id,
          username: user.username,
          role: user.role,
        },
        env,
      );

      sendSuccess(res, 200, {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
      return true;
    }

    if (isWriteMethod(req.method) && !shouldSkipAuth(pathname)) {
      await ensureAuth();
    }

    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const user = await ensureAuth();
      sendSuccess(res, 200, user);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      await ensureAdmin();
      sendSuccess(res, 200, await listUsers());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/users') {
      await ensureAdmin();
      const body = createUserSchema.parse(await readJsonBody(req));
      const created = await createUser(body, env.passwordPepper);
      sendSuccess(res, 201, created);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/users/') && !pathname.endsWith('/password')) {
      await ensureAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', ''));
      const body = updateUserSchema.parse(await readJsonBody(req));
      const updated = await updateUserByAdmin(userId, body);
      sendSuccess(res, 200, updated);
      return true;
    }

    if (req.method === 'PATCH' && pathname === '/api/users/me/password') {
      const user = await ensureAuth();
      const body = selfChangePasswordSchema.parse(await readJsonBody(req));
      const result = await changeOwnPassword(user.id, body.currentPassword, body.newPassword, env.passwordPepper);
      sendSuccess(res, 200, result);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/users/') && pathname.endsWith('/password')) {
      await ensureAdmin();
      const userId = decodeURIComponent(pathname.replace('/api/users/', '').replace('/password', ''));
      const body = adminChangePasswordSchema.parse(await readJsonBody(req));
      const result = await changeUserPasswordByAdmin(userId, body.newPassword, env.passwordPepper);
      sendSuccess(res, 200, result);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/categories') {
      sendSuccess(res, 200, await listCategories());
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/customers') {
      await ensureAuth();
      const query = (searchParams.get('q') || '').trim();
      sendSuccess(res, 200, await listCustomers({ query }));
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/schema') {
      sendSuccess(res, 200, await getSchemaSummary());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/categories') {
      const body = createCategorySchema.parse(await readJsonBody(req));
      const category = await createCategory(body.name);
      sendSuccess(res, 201, category);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/categories/')) {
      const categoryName = decodeURIComponent(pathname.replace('/api/categories/', ''));
      const removed = await deleteCategory(categoryName);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/items') {
      sendSuccess(res, 200, await listItems());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/items') {
      const body = createItemSchema.parse(await readJsonBody(req));
      const item = await createItem(body);
      sendSuccess(res, 201, item);
      return true;
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(pathname.replace('/api/items/', ''));
      const body = updateItemSchema.parse(await readJsonBody(req));
      const item = await updateItem(itemId, body);
      sendSuccess(res, 200, item);
      return true;
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/items/')) {
      const itemId = decodeURIComponent(pathname.replace('/api/items/', ''));
      const removed = await deleteItem(itemId);
      sendSuccess(res, 200, removed);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/rentals') {
      const status = searchParams.get('status') || undefined;
      sendSuccess(res, 200, await listRentals({ status }));
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/rentals') {
      const body = createRentalSchema.parse(await readJsonBody(req));
      const rental = await createRental(body);
      sendSuccess(res, 201, rental);
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/returns') {
      sendSuccess(res, 200, await listReturns());
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/returns') {
      const body = processReturnSchema.parse(await readJsonBody(req));
      const result = await processReturn(body);
      sendSuccess(res, 200, result);
      return true;
    }
  } catch (error) {
    if (error instanceof ZodError) {
      sendError(res, 400, 'Validation failed', error.issues);
      return true;
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';

    if (message === 'Unauthorized' || message.toLowerCase().includes('jwt')) {
      sendError(res, 401, 'Unauthorized');
      return true;
    }

    if (message === 'Forbidden') {
      sendError(res, 403, 'Forbidden');
      return true;
    }

    if (
      message.includes('not found') ||
      message.includes('does not exist')
    ) {
      sendError(res, 404, message);
      return true;
    }

    sendError(res, 400, message);
    return true;
  }

  return false;
}
