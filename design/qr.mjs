const EC_M = [
  null,
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51],
  [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38],
  [24, 4, 40, 5, 41],
  [24, 5, 41, 5, 42],
  [28, 7, 45, 3, 46],
  [28, 10, 46, 1, 47],
  [26, 9, 43, 4, 44],
  [26, 3, 44, 11, 45],
  [26, 3, 41, 13, 42],
];

const ALIGNMENT = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
];

const FORMAT_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

const VERSION_INFO = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
  11: 0x0bbf6,
  12: 0x0c762,
  13: 0x0d847,
  14: 0x0e60d,
  15: 0x0f928,
  16: 0x10b78,
  17: 0x1145d,
  18: 0x12a17,
  19: 0x13532,
  20: 0x149a6,
};

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]; // × x
      next[j + 1] ^= mul(poly[j], EXP[i]); // × α^i
    }
    poly = next;
  }
  return poly;
}

function remainder(data, degree) {
  const gen = generator(degree);
  const out = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    for (let i = 0; i < degree; i += 1) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

const totalDataCodewords = (version) => {
  const [, g1, d1, g2, d2] = EC_M[version];
  return g1 * d1 + g2 * d2;
};

function smallestVersion(byteLength) {
  for (let v = 1; v <= 20; v += 1) {
    const headerBits = 4 + (v < 10 ? 8 : 16);
    if (headerBits + byteLength * 8 <= totalDataCodewords(v) * 8) return v;
  }
  throw new RangeError(`payload of ${byteLength} bytes exceeds version 20 at EC level M`);
}

function bitStream(bytes, version) {
  const capacity = totalDataCodewords(version);
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);

  const limit = capacity * 8;
  for (let i = 0; i < 4 && bits.length < limit; i += 1) bits.push(0); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(capacity);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords[i / 8] = byte;
  }
  for (let i = bits.length / 8, pad = 0; i < capacity; i += 1, pad += 1) {
    codewords[i] = pad % 2 === 0 ? 0xec : 0x11;
  }
  return codewords;
}

function interleave(codewords, version) {
  const [ecPerBlock, g1, d1, g2, d2] = EC_M[version];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < g1 + g2; i += 1) {
    const size = i < g1 ? d1 : d2;
    const data = codewords.slice(offset, offset + size);
    offset += size;
    blocks.push({ data, ec: remainder(data, ecPerBlock) });
  }

  const out = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i]);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of blocks) out.push(block.ec[i]);
  }
  return out;
}

const EMPTY = -1;

function reserved(version) {
  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Int8Array(size).fill(EMPTY));

  const finder = (row, col) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = row + r;
        const x = col + c;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        if (r < 0 || r > 6 || c < 0 || c > 6) {
          grid[y][x] = 0;
          continue;
        }
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[y][x] = edge || core ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const bit = i % 2 === 0 ? 1 : 0;
    grid[6][i] = bit;
    grid[i][6] = bit;
  }

  const coords = ALIGNMENT[version];
  const first = coords[0];
  const last = coords[coords.length - 1];
  for (const row of coords) {
    for (const col of coords) {
      const onFinder =
        (row === first && col === first) ||
        (row === first && col === last) ||
        (row === last && col === first);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const ring = Math.max(Math.abs(r), Math.abs(c));
          grid[row + r][col + c] = ring === 1 ? 0 : 1;
        }
      }
    }
  }

  grid[size - 8][8] = 1; // dark module
  return grid;
}

function reserveInfoAreas(grid, version) {
  const size = grid.length;
  const mark = (y, x) => {
    if (grid[y][x] === EMPTY) grid[y][x] = 0;
  };
  for (let i = 0; i < 9; i += 1) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i += 1) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      mark(Math.floor(i / 3), size - 11 + (i % 3));
      mark(size - 11 + (i % 3), Math.floor(i / 3));
    }
  }
}

function placeData(grid, data, taken) {
  const size = grid.length;
  let bit = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1; // skip the vertical timing column
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (taken[row][col] !== EMPTY) continue;
        const byte = data[bit >> 3];
        grid[row][col] = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
        bit += 1;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(grid) {
  const size = grid.length;
  let score = 0;

  const runScore = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) run += 1;
      else {
        if (run >= 5) total += run - 2;
        run = 1;
      }
    }
    if (run >= 5) total += run - 2;
    return total;
  };

  for (let i = 0; i < size; i += 1) {
    score += runScore(grid[i]);
    score += runScore(grid.map((row) => row[i]));
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }

  const pattern = [1, 0, 1, 1, 1, 0, 1];
  const hasPattern = (line, at) => pattern.every((p, i) => line[at + i] === p);
  const quiet = (line, from, to) => {
    for (let i = from; i < to; i += 1) if (line[i] !== 0) return false;
    return true;
  };
  const lines = [];
  for (let i = 0; i < size; i += 1) {
    lines.push(Array.from(grid[i]));
    lines.push(grid.map((row) => row[i]));
  }
  for (const line of lines) {
    for (let i = 0; i + 7 <= line.length; i += 1) {
      if (!hasPattern(line, i)) continue;
      if (i >= 4 && quiet(line, i - 4, i)) score += 40;
      if (i + 11 <= line.length && quiet(line, i + 7, i + 11)) score += 40;
    }
  }

  let dark = 0;
  for (const row of grid) for (const v of row) dark += v;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

function writeFormat(grid, mask) {
  const size = grid.length;
  const bits = FORMAT_M[mask];

  const copy1 = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  const copy2 = [
    [size - 1, 8],
    [size - 2, 8],
    [size - 3, 8],
    [size - 4, 8],
    [size - 5, 8],
    [size - 6, 8],
    [size - 7, 8],
    [8, size - 8],
    [8, size - 7],
    [8, size - 6],
    [8, size - 5],
    [8, size - 4],
    [8, size - 3],
    [8, size - 2],
    [8, size - 1],
  ];

  for (let i = 0; i < 15; i += 1) {
    const bit = (bits >> (14 - i)) & 1;
    grid[copy1[i][0]][copy1[i][1]] = bit;
    grid[copy2[i][0]][copy2[i][1]] = bit;
  }
  grid[size - 8][8] = 1;
}

function writeVersion(grid, version) {
  if (version < 7) return;
  const size = grid.length;
  const bits = VERSION_INFO[version];
  for (let i = 0; i < 18; i += 1) {
    const bit = (bits >> i) & 1;
    grid[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
    grid[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
  }
}

export function encode(text) {
  const bytes = new TextEncoder().encode(text);
  const version = smallestVersion(bytes.length);
  const data = interleave(bitStream(bytes, version), version);

  const taken = reserved(version);
  reserveInfoAreas(taken, version);

  const base = taken.map((row) => Array.from(row));
  placeData(base, data, taken);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = base.map((row) => Array.from(row));
    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid.length; c += 1) {
        if (taken[r][c] === EMPTY && MASKS[mask](r, c)) grid[r][c] ^= 1;
      }
    }
    writeFormat(grid, mask);
    writeVersion(grid, version);
    const score = penalty(grid);
    if (best === null || score < best.score) best = { score, grid };
  }

  return { version, size: best.grid.length, modules: best.grid };
}

export function toSvgPath({ size, modules }, quietZone = 4) {
  const parts = [];
  for (let r = 0; r < size; r += 1) {
    let run = 0;
    for (let c = 0; c <= size; c += 1) {
      const on = c < size && modules[r][c] === 1;
      if (on) run += 1;
      else if (run > 0) {
        parts.push(`M${c - run + quietZone} ${r + quietZone}h${run}v1h-${run}z`);
        run = 0;
      }
    }
  }
  return { d: parts.join(''), extent: size + quietZone * 2 };
}

export function crc16(text) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

export function brCode({ key, name, city, amount, txid }) {
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const payload =
    tlv('00', '01') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', amount) +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', txid)) +
    '6304';
  return payload + crc16(payload);
}
