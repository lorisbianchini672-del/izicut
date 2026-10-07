/**
 * Générateur de QR code minimal (mode octet, correction M, versions 1 à 10 :
 * jusqu'à 213 caractères — largement assez pour un lien). Inspiré de
 * l'algorithme de référence de Nayuki. Renvoie une matrice de modules.
 */

// [codewords de correction par bloc, nb blocs groupe 1, octets de données groupe 1, nb blocs groupe 2, octets groupe 2]
const EC_M: [number, number, number, number, number][] = [
  [0, 0, 0, 0, 0],
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]
];
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function dataCapacity(v: number) {
  const [, b1, d1, b2, d2] = EC_M[v];
  return b1 * d1 + b2 * d2;
}

// ---------- Reed-Solomon sur GF(256) ----------
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const res = new Array(degree).fill(0);
  res[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < res.length; j++) {
      res[j] = gfMul(res[j], root);
      if (j + 1 < res.length) res[j] ^= res[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return res;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const res = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (res.shift() as number);
    res.push(0);
    divisor.forEach((coef, i) => { res[i] ^= gfMul(coef, factor); });
  }
  return res;
}

export function makeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  for (; version <= 10; version++) {
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCapacity(version) * 8) break;
  }
  if (version > 10) throw new Error('Lien trop long pour un QR code');
  const countBits = version < 10 ? 8 : 16;
  const cap = dataCapacity(version) * 8;

  // ---- Flux de bits ----
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, countBits);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // ---- Blocs + correction, entrelacés ----
  const [ecLen, b1, d1, b2, d2] = EC_M[version];
  const div = rsDivisor(ecLen);
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  let k = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const len = i < b1 ? d1 : d2;
    const blk = data.slice(k, k + len);
    k += len;
    blocks.push(blk);
    ecs.push(rsRemainder(blk, div));
  }
  const codewords: number[] = [];
  const maxLen = Math.max(d1, d2);
  for (let i = 0; i < maxLen; i++) for (const blk of blocks) if (i < blk.length) codewords.push(blk[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) codewords.push(e[i]);

  // ---- Matrice ----
  const size = version * 4 + 17;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[version];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask: number) => {
    const dataBits = (0b00 << 3) | mask; // niveau M = 00
    let rem = dataBits;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((dataBits << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((b >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, bit); set(c, a, bit);
    }
  }

  // ---- Placement en zigzag ----
  let bi = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && bi < total) {
        mod[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1;
        bi++;
      }
    }
  }

  // ---- Masque : on garde celui qui pénalise le moins ----
  const maskFn = (m: number, x: number, y: number) => {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn(m, x, y)) mod[y][x] = !mod[y][x];
  };
  const penalty = () => {
    let p = 0;
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b < size; b++) {
        const cur = pass ? mod[b][a] : mod[a][b];
        const prev = pass ? mod[b - 1][a] : mod[a][b - 1];
        if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    const pat = [true, false, true, true, true, false, true];
    for (let y = 0; y < size; y++) for (let x = 0; x + 7 <= size; x++) {
      let row = true, col = true;
      for (let i = 0; i < 7; i++) { if (mod[y][x + i] !== pat[i]) row = false; if (mod[x + i][y] !== pat[i]) col = false; }
      const lightAround = (get: (i: number) => boolean | undefined) => [-4, -3, -2, -1].every((i) => !get(i)) || [7, 8, 9, 10].every((i) => !get(i));
      if (row && lightAround((i) => mod[y][x + i])) p += 40;
      if (col && lightAround((i) => mod[x + i]?.[y])) p += 40;
    }
    let dark = 0;
    for (const r of mod) for (const v of r) if (v) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const pv = penalty();
    if (pv < bestP) { bestP = pv; best = m; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}
