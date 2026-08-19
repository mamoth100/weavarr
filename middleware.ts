import { NextResponse, type NextRequest } from 'next/server';

// Only API routes change state; pages are all GET-rendered.
export const config = { matcher: '/api/:path*' };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for a deliberately auth-less app: with no login to steal,
 * the remaining browser attack is a malicious web page firing state-changing
 * requests at a Weavarr on the visitor's LAN (delete media, rewrite
 * settings). Browsers label such requests - an Origin header naming the
 * attacker's site - so state-changing API calls are only accepted when the
 * request's Origin matches the host being addressed. Non-browser clients
 * (curl, scripts) send no Origin and pass through: CSRF is strictly a
 * browser problem, and blocking header-less calls would break every
 * automation while stopping no attacker (headers are trivially set outside
 * a browser anyway).
 *
 * Note these read process.env, which Next loads from .env.local at boot -
 * changing them in Settings takes effect on the next restart, same as every
 * other non-menu setting.
 */
export function middleware(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();
  if (process.env.ENABLE_CSRF_PROTECTION === 'false') return NextResponse.next();

  const origin = req.headers.get('origin');
  if (origin === null) {
    // No Origin = not a cross-site browser request, except for the rare
    // browser that omits it but still stamps Sec-Fetch-Site.
    if (req.headers.get('sec-fetch-site') === 'cross-site') {
      return blocked(req, 'sec-fetch-site: cross-site');
    }
    return NextResponse.next();
  }

  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Unparseable or "null" Origin (sandboxed iframe, data: page) - treat as cross-site.
  }

  const allowedHosts = new Set<string>();
  const host = req.headers.get('host');
  if (host) allowedHosts.add(host);
  // Behind a reverse proxy that rewrites Host to the upstream address, the
  // browser's Origin names the PUBLIC host - only visible via the proxy's
  // forwarded header, which is attacker-controlled unless the operator has
  // declared the proxy trusted.
  if (process.env.TRUST_PROXY === 'true') {
    const forwardedHost = req.headers.get('x-forwarded-host');
    if (forwardedHost) allowedHosts.add(forwardedHost.split(',')[0].trim());
  }
  // The canonical address always counts, proxy or not.
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      allowedHosts.add(new URL(appUrl).host);
    } catch {}
  }

  if (originHost && allowedHosts.has(originHost)) return NextResponse.next();
  return blocked(req, `origin ${origin} does not match ${Array.from(allowedHosts).join('/') || 'any allowed host'}`);
}

function blocked(req: NextRequest, reason: string) {
  console.warn(`[csrf] blocked ${req.method} ${req.nextUrl.pathname} from ${clientIp(req)} - ${reason}`);
  return NextResponse.json(
    { error: 'Cross-site request blocked (CSRF protection). Set ENABLE_CSRF_PROTECTION=false to disable.' },
    { status: 403 }
  );
}

/** The real client address - via the proxy's forwarded header only when the operator declared the proxy trusted (anyone can send X-Forwarded-For; only a trusted proxy's copy means anything). */
function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}
