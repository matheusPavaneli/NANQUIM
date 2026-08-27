export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface BrCodeFields {
  readonly name?: string;
  readonly amount?: string;
  readonly txid?: string;
  readonly crcValid: boolean;
}

function readTlv(payload: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const length = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    if (!Number.isInteger(length) || length < 0) return null;
    const value = payload.slice(i + 4, i + 4 + length);
    if (value.length !== length) return null;
    out.set(tag, value);
    i += 4 + length;
  }
  return i === payload.length ? out : null;
}

export function isValidBrCode(payload: string): boolean {
  if (payload.length < 8) return false;
  const body = payload.slice(0, -4);
  if (!body.endsWith('6304')) return false;
  return crc16(body) === payload.slice(-4).toUpperCase();
}

export function parseBrCode(payload: string): BrCodeFields | null {
  const fields = readTlv(payload);
  if (fields === null) return null;
  const name = fields.get('59');
  const amount = fields.get('54');
  const additional = fields.get('62');
  const txid = additional === undefined ? undefined : readTlv(additional)?.get('05');
  return {
    ...(name === undefined ? {} : { name }),
    ...(amount === undefined ? {} : { amount }),
    ...(txid === undefined ? {} : { txid }),
    crcValid: isValidBrCode(payload),
  };
}
