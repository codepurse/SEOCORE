import crypto from 'crypto';

export function createDiffId(aspect: string, url: string, payload: unknown): string {
  const data = JSON.stringify({ aspect, url, payload });
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
}
