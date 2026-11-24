export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SIGNATURES: Record<string, string> = {
  'image/jpeg': '/9j',
  'image/png': 'iVBOR',
  'image/webp': 'UklGR',
};

export function decodedBytes(base64: string) {
  const clean = base64.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export function imageProblem(mime: string, base64: string) {
  if (!SIGNATURES[mime]) return 'Use a JPEG, PNG, or WebP photo';
  if (!base64.startsWith(SIGNATURES[mime])) return 'That photo does not match its file type';
  if (decodedBytes(base64) > MAX_IMAGE_BYTES) return 'The photo must be under 5 MB';
  return '';
}

export function createRequestId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `scn-${time}-${rand}`;
}
