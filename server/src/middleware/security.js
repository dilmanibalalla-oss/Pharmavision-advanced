import crypto from 'crypto';

const buckets = new Map();

function clientKey(req) {
  return cleanAddress(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local');
}

function cleanAddress(value) {
  return String(value).split(',')[0].trim().slice(0, 80) || 'local';
}

export function requestId(req, res, next) {
  const supplied = String(req.headers['x-request-id'] || '');
  req.requestId = /^[A-Za-z0-9-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
}

function hasOperator(value, depth = 0) {
  if (depth > 6 || value == null) return false;
  if (Array.isArray(value)) return value.some((item) => hasOperator(item, depth + 1));
  if (typeof value === 'object') {
    return Object.keys(value).some((key) => key.startsWith('$') || key.includes('.') || hasOperator(value[key], depth + 1));
  }
  return false;
}

export function rejectOperators(req, res, next) {
  if (hasOperator(req.body) || hasOperator(req.query) || hasOperator(req.params)) {
    return res.status(400).json({ message: 'That request could not be read' });
  }
  return next();
}

export function rateLimit({ name, limit, windowMs }) {
  return (req, res, next) => {
    const max = Number(process.env[`RATE_LIMIT_${name}`] || limit);
    const now = Date.now();
    const key = `${name}:${clientKey(req)}`;
    const recent = (buckets.get(key) || []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ message: 'Too many requests. Wait a moment and try again' });
    }
    recent.push(now);
    buckets.set(key, recent);
    return next();
  };
}

export function allowedOrigin(origin) {
  if (!origin) return true;
  const allowed = new Set(['http://localhost:5175', 'http://127.0.0.1:5175']);
  if (process.env.CLIENT_ORIGIN) allowed.add(process.env.CLIENT_ORIGIN);
  return allowed.has(origin);
}
