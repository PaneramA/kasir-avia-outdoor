import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  resolveTenantBranchContextForUser: vi.fn(),
}));

const processorMocks = vi.hoisted(() => ({
  processItemImage: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  saveItemImageSet: vi.fn(),
}));

vi.mock('../data/db.js', async () => {
  const actual = await vi.importActual('../data/db.js');
  return {
    ...actual,
    findUserById: dbMocks.findUserById,
    resolveTenantBranchContextForUser: dbMocks.resolveTenantBranchContextForUser,
  };
});

vi.mock('../images/itemImageProcessor.js', () => ({
  processItemImage: processorMocks.processItemImage,
}));

vi.mock('../images/itemImageStorage.js', () => ({
  saveItemImageSet: storageMocks.saveItemImageSet,
}));

const { createAccessToken } = await import('../auth/jwt.js');
const { apiRoute } = await import('./api.js');

function createResponse() {
  let status = 0;
  let rawBody = '';
  const headers = new Map();

  return {
    headers,
    get status() {
      return status;
    },
    get body() {
      return rawBody ? JSON.parse(rawBody) : null;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    writeHead(nextStatus, nextHeaders = {}) {
      status = nextStatus;
      Object.entries(nextHeaders).forEach(([name, value]) => {
        headers.set(String(name).toLowerCase(), value);
      });
    },
    end(value = '') {
      rawBody = String(value);
    },
  };
}

function createMultipartBody({
  boundary = '----avia-route-test-boundary',
  contentType = 'image/png',
  filename = 'item.png',
  body = Buffer.from('uploaded-image'),
} = {}) {
  return {
    boundary,
    chunks: [
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="image"; filename="${filename}"\r\n`),
      Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ],
  };
}

function createToken(user) {
  return createAccessToken(
    { sub: user.id, username: user.username, role: user.role },
    {
      jwtSecret: 'test-jwt-secret-with-at-least-thirty-two-characters',
      jwtExpiresIn: '8h',
    },
  );
}

async function callUploadRoute({ token, tenantId = 'tenant-1', branchId = 'branch-1', upload = {} } = {}) {
  const multipart = createMultipartBody(upload);
  const req = Readable.from(multipart.chunks);
  req.method = 'POST';
  req.url = '/api/items/images';
  req.headers = {
    authorization: `Bearer ${token}`,
    'x-tenant-id': tenantId,
    'x-branch-id': branchId,
    'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
  };
  req.socket = { remoteAddress: '127.0.0.1' };

  const res = createResponse();
  await apiRoute(req, res, {
    jwtSecret: 'test-jwt-secret-with-at-least-thirty-two-characters',
    requestBodyLimitBytes: 1_048_576,
    requestBodyTimeoutMs: 1_000,
    itemImageUploadLimitBytes: 1_048_576,
    itemImageStorageDir: 'test-storage',
    publicUploadsBaseUrl: '/uploads/item-images',
  });
  return res;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('item image upload route', () => {
  it('compresses and stores an authenticated inventory image upload', async () => {
    const user = { id: 'user-1', username: 'owner@example.test', role: 'admin' };
    const token = createToken(user);
    dbMocks.findUserById.mockResolvedValue(user);
    dbMocks.resolveTenantBranchContextForUser.mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      membershipRole: 'owner',
    });
    processorMocks.processItemImage.mockResolvedValue({
      detailBuffer: Buffer.from('detail-webp'),
      thumbnailBuffer: Buffer.from('thumb-webp'),
      metadata: {
        mimeType: 'image/webp',
        originalBytes: 14,
        detail: { width: 800, height: 600, bytes: 11 },
        thumbnail: { width: 320, height: 240, bytes: 10 },
      },
    });
    storageMocks.saveItemImageSet.mockResolvedValue({
      detail: {
        storageKey: 'tenant-1/upload-1/detail.webp',
        url: '/uploads/item-images/tenant-1/upload-1/detail.webp',
        bytes: 11,
      },
      thumbnail: {
        storageKey: 'tenant-1/upload-1/thumb.webp',
        url: '/uploads/item-images/tenant-1/upload-1/thumb.webp',
        bytes: 10,
      },
    });

    const response = await callUploadRoute({ token });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      data: {
        image: '/uploads/item-images/tenant-1/upload-1/thumb.webp',
        detailUrl: '/uploads/item-images/tenant-1/upload-1/detail.webp',
        thumbnailUrl: '/uploads/item-images/tenant-1/upload-1/thumb.webp',
        mimeType: 'image/webp',
      },
    });
    expect(processorMocks.processItemImage).toHaveBeenCalledWith(
      Buffer.from('uploaded-image'),
      expect.any(Object),
    );
    expect(storageMocks.saveItemImageSet).toHaveBeenCalledWith(expect.objectContaining({
      storageDir: 'test-storage',
      publicBaseUrl: '/uploads/item-images',
      tenantId: 'tenant-1',
      itemId: expect.stringMatching(/^upload-/),
      detailBuffer: Buffer.from('detail-webp'),
      thumbnailBuffer: Buffer.from('thumb-webp'),
    }));
  });

  it('rejects unsupported upload file types', async () => {
    const user = { id: 'user-1', username: 'owner@example.test', role: 'admin' };
    const token = createToken(user);
    dbMocks.findUserById.mockResolvedValue(user);
    dbMocks.resolveTenantBranchContextForUser.mockResolvedValue({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      membershipRole: 'owner',
    });

    const response = await callUploadRoute({
      token,
      upload: {
        contentType: 'text/plain',
        filename: 'payload.txt',
        body: Buffer.from('text'),
      },
    });

    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({ ok: false, message: 'Unsupported image type' });
    expect(processorMocks.processItemImage).not.toHaveBeenCalled();
    expect(storageMocks.saveItemImageSet).not.toHaveBeenCalled();
  });
});
