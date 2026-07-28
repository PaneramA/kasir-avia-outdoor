import Busboy from 'busboy';

export const ITEM_IMAGE_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getContentType(req) {
  const raw = req?.headers?.['content-type'];
  if (Array.isArray(raw)) {
    return String(raw[0] || '').trim();
  }

  return String(raw || '').trim();
}

function rejectOnce(done, error) {
  done(error);
}

export async function readItemImageUpload(req, {
  limitBytes = 8_388_608,
  allowedMimeTypes = ITEM_IMAGE_ALLOWED_MIME_TYPES,
} = {}) {
  const contentType = getContentType(req);
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw httpError(400, 'Multipart image upload is required');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let fileResult = null;
    let acceptedFileSeen = false;

    const done = (error, result) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: limitBytes,
          fields: 5,
          parts: 6,
        },
      });
    } catch {
      done(httpError(400, 'Multipart image upload is required'));
      return;
    }

    parser.on('file', (fieldName, file, info = {}) => {
      if (fieldName !== 'image') {
        file.resume();
        return;
      }

      if (acceptedFileSeen) {
        file.resume();
        rejectOnce(done, httpError(400, 'Only one image file is allowed'));
        return;
      }

      acceptedFileSeen = true;
      const mimeType = String(info.mimeType || '').trim().toLowerCase();
      const filename = String(info.filename || '').trim();

      if (!allowedMimeTypes.has(mimeType)) {
        file.resume();
        rejectOnce(done, httpError(415, 'Unsupported image type'));
        return;
      }

      const chunks = [];
      file.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      file.on('limit', () => {
        file.resume();
        rejectOnce(done, httpError(413, 'Image file too large'));
      });
      file.on('end', () => {
        if (settled) {
          return;
        }

        const buffer = Buffer.concat(chunks);
        if (buffer.byteLength === 0) {
          rejectOnce(done, httpError(400, 'Image file is required'));
          return;
        }

        fileResult = {
          buffer,
          filename,
          mimeType,
        };
      });
    });

    parser.on('filesLimit', () => {
      rejectOnce(done, httpError(400, 'Only one image file is allowed'));
    });
    parser.on('error', () => {
      rejectOnce(done, httpError(400, 'Multipart image upload is required'));
    });
    parser.on('finish', () => {
      if (settled) {
        return;
      }
      if (!fileResult) {
        rejectOnce(done, httpError(400, 'Image file is required'));
        return;
      }
      done(null, fileResult);
    });

    req.pipe(parser);
  });
}
