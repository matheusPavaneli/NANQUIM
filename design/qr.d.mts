
export interface ReferenceCode {
  version: number;
  size: number;
  modules: number[][];
}

export function encode(text: string): ReferenceCode;
export function toSvgPath(code: ReferenceCode, quietZone?: number): { d: string; extent: number };
export function crc16(text: string): string;
export function brCode(fields: {
  key: string;
  name: string;
  city: string;
  amount: string;
  txid: string;
}): string;
