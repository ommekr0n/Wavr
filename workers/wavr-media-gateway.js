const encoder = new TextEncoder();

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]);
const SAFE_AUDIO_TYPE_RE = /^audio\/[a-z0-9.+-]+$/;
const MAX_AUDIO_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin'
  };
}

function response(body, status, headers) {
  return new Response(body, { status, headers });
}

async function authenticatedUser(request, env) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization }
  });
  if (!authResponse.ok) return null;
  return authResponse.json();
}

function pathFromRequest(url, prefix) {
  const rawSegments = url.pathname.slice(prefix.length).split('/');
  const decodedSegments = [];
  for (const segment of rawSegments) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || /[\x00-\x1f\x7f]/.test(decoded)) {
      return null;
    }
    decodedSegments.push(decoded);
  }
  const value = decodedSegments.join('/');
  return value || null;
}

function ownsPath(user, key) {
  return key.startsWith(`${user.id}/`);
}

function normalizeUploadMediaType(headerValue) {
  const raw = (headerValue || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  if (raw === 'application/octet-stream' || ALLOWED_IMAGE_TYPES.has(raw) || SAFE_AUDIO_TYPE_RE.test(raw)) {
    return raw;
  }
  return null;
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sign(key, expires, env) {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(env.MEDIA_SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${key}\n${expires}`)));
}

async function validSignature(key, expires, signature, env) {
  if (typeof expires !== 'string' || !/^\d+$/.test(expires) || !signature) return false;
  const exp = Number(expires);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(exp) || exp < now || exp > now + 3600) return false;
  const sigBytes = base64UrlToBytes(signature);
  if (!sigBytes) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(env.MEDIA_SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', cryptoKey, sigBytes, encoder.encode(`${key}\n${expires}`));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return response(null, 204, headers);

    try {
      if (request.method === 'PUT' && url.pathname.startsWith('/v1/media/')) {
        const key = pathFromRequest(url, '/v1/media/');
        const user = key && await authenticatedUser(request, env);
        if (!user || !ownsPath(user, key)) return response('Unauthorized', 401, headers);

        const mediaType = normalizeUploadMediaType(request.headers.get('Content-Type'));
        if (!mediaType) return response('Unsupported Media Type', 415, headers);

        const maxBytes = ALLOWED_IMAGE_TYPES.has(mediaType) ? MAX_IMAGE_UPLOAD_BYTES : MAX_AUDIO_UPLOAD_BYTES;
        const contentLengthHeader = request.headers.get('Content-Length');
        if (contentLengthHeader === null) return response('Length Required', 411, headers);
        const trimmedLength = contentLengthHeader.trim();
        if (!/^\d+$/.test(trimmedLength)) return response('Payload Too Large', 413, headers);
        const contentLength = Number(trimmedLength);
        if (!Number.isSafeInteger(contentLength) || contentLength > maxBytes) {
          return response('Payload Too Large', 413, headers);
        }

        await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: mediaType } });
        return response(null, 201, headers);
      }

      if (request.method === 'DELETE' && url.pathname.startsWith('/v1/media/')) {
        const key = pathFromRequest(url, '/v1/media/');
        const user = key && await authenticatedUser(request, env);
        if (!user || !ownsPath(user, key)) return response('Unauthorized', 401, headers);
        await env.MEDIA.delete(key);
        return response(null, 204, headers);
      }

      if (request.method === 'POST' && url.pathname.startsWith('/v1/signed/')) {
        const key = pathFromRequest(url, '/v1/signed/');
        const user = key && await authenticatedUser(request, env);
        if (!user || !ownsPath(user, key)) return response('Unauthorized', 401, headers);
        const expires = String(Math.floor(Date.now() / 1000) + 900);
        const signature = await sign(key, expires, env);
        return response(JSON.stringify({ url: `${url.origin}/v1/media/${key.split('/').map(encodeURIComponent).join('/')}?expires=${expires}&signature=${encodeURIComponent(signature)}` }), 200, { ...headers, 'Content-Type': 'application/json' });
      }

      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/v1/media/')) {
        const key = pathFromRequest(url, '/v1/media/');
        if (!key || !(await validSignature(key, url.searchParams.get('expires'), url.searchParams.get('signature'), env))) return response('Unauthorized', 401, headers);

        const baseMediaHeaders = {
          ...headers,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox"
        };

        if (request.method === 'HEAD') {
          const object = await env.MEDIA.head(key);
          if (!object) return response('Not found', 404, headers);
          return response(null, 200, {
            ...baseMediaHeaders,
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Content-Length': String(object.size)
          });
        }

        const rangeHeader = request.headers.get('Range');
        const object = rangeHeader
          ? await env.MEDIA.get(key, { range: request.headers })
          : await env.MEDIA.get(key);
        if (!object) return response('Not found', 404, headers);

        const responseHeaders = {
          ...baseMediaHeaders,
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream'
        };

        if (rangeHeader) {
          if (object.size === 0) {
            object.body?.cancel?.();
            return response('Range Not Satisfiable', 416, {
              ...headers,
              'Content-Range': 'bytes */0'
            });
          }
          if (object.range) {
            let start = 0;
            let end = object.size - 1;
            if (typeof object.range.suffix === 'number') {
              const suffixLen = Math.min(object.range.suffix, object.size);
              start = object.size - suffixLen;
              end = object.size - 1;
            } else {
              start = object.range.offset ?? 0;
              const length = object.range.length ?? (object.size - start);
              end = Math.min(start + length - 1, object.size - 1);
            }
            if (start < 0 || start >= object.size || end < start) {
              object.body?.cancel?.();
              return response('Range Not Satisfiable', 416, {
                ...headers,
                'Content-Range': `bytes */${object.size}`
              });
            }
            responseHeaders['Content-Range'] = `bytes ${start}-${end}/${object.size}`;
            responseHeaders['Content-Length'] = String(end - start + 1);
            return response(object.body, 206, responseHeaders);
          }
        }

        responseHeaders['Content-Length'] = String(object.size);
        return response(object.body, 200, responseHeaders);
      }
      return response('Not found', 404, headers);
    } catch (error) {
      console.error(JSON.stringify({ message: 'media gateway error', error: String(error) }));
      return response('Internal server error', 500, headers);
    }
  }
};
