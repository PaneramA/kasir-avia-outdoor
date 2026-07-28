import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readItemImageUpload } from './itemImageUpload.js';

function createMultipartRequest({
  boundary = '----avia-test-boundary',
  fieldName = 'image',
  filename = 'tenda.png',
  contentType = 'image/png',
  body = Buffer.from('image-bytes'),
} = {}) {
  const chunks = [
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const req = Readable.from(chunks);
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };
  return req;
}

describe('item image upload parser', () => {
  it('reads a single allowed image file from multipart form data', async () => {
    const imageBuffer = Buffer.from('png-file');

    const result = await readItemImageUpload(createMultipartRequest({ body: imageBuffer }), {
      limitBytes: 1024,
    });

    expect(result).toEqual({
      buffer: imageBuffer,
      filename: 'tenda.png',
      mimeType: 'image/png',
    });
  });

  it('rejects non-multipart requests with a client error', async () => {
    const req = Readable.from([Buffer.from('{}')]);
    req.headers = { 'content-type': 'application/json' };

    await expect(readItemImageUpload(req, { limitBytes: 1024 }))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'Multipart image upload is required',
      });
  });

  it('rejects disallowed MIME types before processing', async () => {
    const req = createMultipartRequest({
      filename: 'payload.txt',
      contentType: 'text/plain',
      body: Buffer.from('not-image'),
    });

    await expect(readItemImageUpload(req, { limitBytes: 1024 }))
      .rejects.toMatchObject({
        statusCode: 415,
        message: 'Unsupported image type',
      });
  });

  it('rejects files over the configured upload limit', async () => {
    const req = createMultipartRequest({
      body: Buffer.alloc(20, 1),
    });

    await expect(readItemImageUpload(req, { limitBytes: 10 }))
      .rejects.toMatchObject({
        statusCode: 413,
        message: 'Image file too large',
      });
  });
});
