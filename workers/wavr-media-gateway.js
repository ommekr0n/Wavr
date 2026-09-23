const encoder = new TextEncoder();

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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
  const value = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
  return value && !value.split('/').includes('..') ? value : null;
}

function ownsPath(user, key) {
  return key.startsWith(`${user.id}/`);
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sign(key, expires, env) {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(env.MEDIA_SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${key}\n${expires}`)));
}

async function validSignature(key, expires, signature, env) {
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000) || Number(expires) > Math.floor(Date.now() / 1000) + 3600) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(env.MEDIA_SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', cryptoKey, base64UrlToBytes(signature), encoder.encode(`${key}\n${expires}`));
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
        await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' } });
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
        const object = await env.MEDIA.get(key);
        if (!object) return response('Not found', 404, headers);
        return response(request.method === 'HEAD' ? null : object.body, 200, { ...headers, 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Content-Length': String(object.size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=300' });
      }
      return response('Not found', 404, headers);
    } catch (error) {
      console.error(JSON.stringify({ message: 'media gateway error', error: String(error) }));
      return response('Internal server error', 500, headers);
    }
  }
};
