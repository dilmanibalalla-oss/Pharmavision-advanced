import crypto from 'crypto';

const NOT_CONNECTED = 'The medicine detection service is not connected. This image was stored for review and was not recognized. Stock was not changed.';

export function detectionConfigured() {
  const url = String(process.env.DETECTION_URL || '').trim();
  const token = String(process.env.DETECTION_TOKEN || '');
  return Boolean(url.startsWith('https://') || url.startsWith('http://')) && token.length >= 16;
}

export function serviceAuthorized(req) {
  const expected = String(process.env.DETECTION_TOKEN || '');
  const got = String(req.headers['x-service-token'] || '');
  if (expected.length < 16 || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function askDetection(scan) {
  if (!detectionConfigured()) {
    return { connected: false, performed: false, message: NOT_CONNECTED, observations: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${process.env.DETECTION_URL.replace(/\/$/, '')}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.DETECTION_TOKEN,
      },
      body: JSON.stringify({
        scanId: String(scan._id),
        shelfId: scan.shelfCode,
        section: scan.section,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        connected: true,
        performed: false,
        message: 'The detection service did not accept this scan. No stock was changed.',
        observations: null,
      };
    }
    const payload = await response.json();
    return {
      connected: true,
      performed: Array.isArray(payload.observations),
      message: 'Detection results were received from the service. They are observations, not stock changes.',
      observations: Array.isArray(payload.observations) ? payload.observations : null,
    };
  } catch {
    return {
      connected: true,
      performed: false,
      message: 'The detection service could not be reached. No stock was changed.',
      observations: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
