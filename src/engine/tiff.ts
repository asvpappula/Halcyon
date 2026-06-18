// Minimal baseline TIFF encoder (uncompressed, little-endian, RGB) — browsers can't
// emit TIFF via canvas.toBlob, so we write the bytes ourselves. Drops alpha. This is a
// valid baseline TIFF readable by Photoshop / Lightroom / Preview. docs/FEATURES.md (P8).

export function encodeTiff(width: number, height: number, rgba: Uint8ClampedArray): ArrayBuffer {
  const SPP = 3 // samples per pixel (RGB)
  const pixelBytes = width * height * SPP
  const N_ENTRIES = 10
  const ifdStart = 8
  const ifdSize = 2 + N_ENTRIES * 12 + 4 // count + entries + next-IFD pointer
  const bitsOffset = ifdStart + ifdSize // external [8,8,8] for BitsPerSample
  const pixelOffset = bitsOffset + 6
  const total = pixelOffset + pixelBytes

  const buf = new ArrayBuffer(total)
  const dv = new DataView(buf)

  dv.setUint16(0, 0x4949, true) // 'II' little-endian
  dv.setUint16(2, 42, true) // magic
  dv.setUint32(4, ifdStart, true) // first IFD offset

  let o = ifdStart
  dv.setUint16(o, N_ENTRIES, true)
  o += 2
  const SHORT = 3
  const LONG = 4
  const entry = (tag: number, type: number, count: number, value: number) => {
    dv.setUint16(o, tag, true)
    dv.setUint16(o + 2, type, true)
    dv.setUint32(o + 4, count, true)
    dv.setUint32(o + 8, value, true) // SHORT values sit in the low bytes (LE) — fine
    o += 12
  }
  entry(256, LONG, 1, width) // ImageWidth
  entry(257, LONG, 1, height) // ImageLength
  entry(258, SHORT, 3, bitsOffset) // BitsPerSample -> [8,8,8] external
  entry(259, SHORT, 1, 1) // Compression = none
  entry(262, SHORT, 1, 2) // PhotometricInterpretation = RGB
  entry(273, LONG, 1, pixelOffset) // StripOffsets
  entry(277, SHORT, 1, SPP) // SamplesPerPixel
  entry(278, LONG, 1, height) // RowsPerStrip (single strip)
  entry(279, LONG, 1, pixelBytes) // StripByteCounts
  entry(284, SHORT, 1, 1) // PlanarConfiguration = chunky
  dv.setUint32(o, 0, true) // next IFD = none

  dv.setUint16(bitsOffset, 8, true)
  dv.setUint16(bitsOffset + 2, 8, true)
  dv.setUint16(bitsOffset + 4, 8, true)

  const out = new Uint8Array(buf)
  let w = pixelOffset
  for (let i = 0; i < width * height; i++) {
    out[w++] = rgba[i * 4]
    out[w++] = rgba[i * 4 + 1]
    out[w++] = rgba[i * 4 + 2]
  }
  return buf
}
