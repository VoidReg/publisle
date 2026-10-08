export function sha256Hex(input: string): string {
  return syncSha256(input);
}

function syncSha256(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const hash = sha256(bytes);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Public-domain style SHA-256 implementation
function sha256(ascii: Uint8Array): Uint8Array {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);

  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  const paddedLength = ((ascii.length + 8) >> 6) + 1;
  const padded = new Uint8Array(paddedLength << 6);
  padded.set(ascii);
  padded[ascii.length] = 0x80;
  for (let i = 0; i < 8; i++) {
    // Bitwise shifts wrap at 32 bits; division preserves the high length bytes.
    padded[padded.length - 1 - i] =
      Math.floor(asciiBitLength / 2 ** (i * 8)) & 0xff;
  }

  const w = new Array<number>(64);
  let a = hash[0]!,
    b = hash[1]!,
    c = hash[2]!,
    d = hash[3]!,
    e = hash[4]!,
    f = hash[5]!,
    g = hash[6]!,
    h = hash[7]!;

  for (let j = 0; j < padded.length;) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        (padded[j]! << 24) |
        (padded[j + 1]! << 16) |
        (padded[j + 2]! << 8) |
        padded[j + 3]!;
      j += 4;
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      w[i] =
        (w[i - 16]! +
          (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
          w[i - 7]! +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
        0;
    }

    const oldA = a,
      oldB = b,
      oldC = c,
      oldD = d,
      oldE = e,
      oldF = f,
      oldG = g,
      oldH = h;

    for (let i = 0; i < 64; i++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i]! + w[i]!) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    a = (a + oldA) | 0;
    b = (b + oldB) | 0;
    c = (c + oldC) | 0;
    d = (d + oldD) | 0;
    e = (e + oldE) | 0;
    f = (f + oldF) | 0;
    g = (g + oldG) | 0;
    h = (h + oldH) | 0;
  }

  const out = new Uint8Array(32);
  const vals = [a, b, c, d, e, f, g, h];
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (vals[i]! >>> 24) & 0xff;
    out[i * 4 + 1] = (vals[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (vals[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = vals[i]! & 0xff;
  }
  return out;
}
