/** Renew only URLs belonging to our gateway; arbitrary external URLs never reach the signer. */
export function privateMediaPath(uri, gateway) {
    if (typeof uri !== 'string') return null;
    if (uri.startsWith('r2://')) return uri.slice(5);
    try {
        const url = new URL(uri);
        if (url.origin === new URL(gateway).origin && url.pathname.startsWith('/v1/media/')) {
            return url.pathname.slice('/v1/media/'.length).split('/').map(decodeURIComponent).join('/');
        }
        if (url.hostname.endsWith('.r2.dev')) return decodeURIComponent(url.pathname.slice(1));
    } catch { /* Local media and malformed URLs are not gateway resources. */ }
    return null;
}

export function mediaUrlNeedsRefresh(uri, gateway, now = Date.now()) {
    if (!privateMediaPath(uri, gateway)) return false;
    try {
        const url = new URL(uri);
        return url.origin !== new URL(gateway).origin || !url.searchParams.get('signature') ||
            !(Number(url.searchParams.get('expires')) * 1000 > now + 120_000);
    } catch { return true; }
}

export function privateMediaUri(uri, gateway) {
    const path = privateMediaPath(uri, gateway);
    return path ? `r2://${path}` : uri;
}

const MAX_BATCH_SIZE = 200;

export function createPrivateMediaResolver(gateway, request, now = Date.now) {
    const pending = new Map();
    const resolve = async uri => {
        const path = privateMediaPath(uri, gateway);
        if (!path || !mediaUrlNeedsRefresh(uri, gateway, now())) return uri;
        if (!pending.has(path)) {
            const job = (async () => {
                const encoded = path.split('/').map(encodeURIComponent).join('/');
                const response = await request(`/v1/signed/${encoded}`, { method: 'POST', cache: 'no-store' });
                if (!response.ok) throw new Error(`Could not access private cloud media (${response.status}).`);
                const { url } = await response.json();
                if (privateMediaPath(url, gateway) !== path || mediaUrlNeedsRefresh(url, gateway, now())) {
                    throw new Error('The media gateway returned an invalid or expired URL.');
                }
                return url;
            })();
            pending.set(path, job);
            job.finally(() => pending.delete(path)).catch(() => {});
        }
        return pending.get(path);
    };

    resolve.batch = async uris => {
        if (!Array.isArray(uris) || uris.length === 0) return [];
        const currentNow = now();
        const uniquePaths = [];
        const pathSet = new Set();

        for (const uri of uris) {
            const path = privateMediaPath(uri, gateway);
            if (path && mediaUrlNeedsRefresh(uri, gateway, currentNow) && !pathSet.has(path)) {
                pathSet.add(path);
                uniquePaths.push(path);
            }
        }

        if (uniquePaths.length === 0) return [...uris];

        const resolvedByPath = new Map();
        for (let i = 0; i < uniquePaths.length; i += MAX_BATCH_SIZE) {
            const chunk = uniquePaths.slice(i, i + MAX_BATCH_SIZE);
            const response = await request('/v1/signed-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: chunk }),
                cache: 'no-store'
            });
            if (response.status === 404) {
                return Promise.all(uris.map(u => resolve(u)));
            }
            if (!response.ok) {
                throw new Error(`Could not batch-sign private cloud media (${response.status}).`);
            }
            const data = await response.json();
            const urls = data?.urls || {};
            const checkNow = now();
            for (const path of chunk) {
                const signedUrl = urls[path];
                if (typeof signedUrl !== 'string' || privateMediaPath(signedUrl, gateway) !== path || mediaUrlNeedsRefresh(signedUrl, gateway, checkNow)) {
                    throw new Error('The media gateway returned an invalid or expired batch URL.');
                }
                resolvedByPath.set(path, signedUrl);
            }
        }

        return uris.map(uri => {
            const path = privateMediaPath(uri, gateway);
            if (!path || !mediaUrlNeedsRefresh(uri, gateway, currentNow)) return uri;
            return resolvedByPath.get(path) || uri;
        });
    };

    return resolve;
}
