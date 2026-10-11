import { crc32 } from 'node:zlib';
import { unzipSync } from 'fflate';

// fflate extracts ZIPs without checking CRCs. Validate the directory and file headers
// as well, so a cryptographically signed but malformed archive cannot be shipped.
export function readMsixArchive(bytes) {
  const archive = Buffer.from(bytes);
  const fail = (name) => {
    throw new Error(
      `Invalid MSIX ZIP headers or checksum${name ? `: ${name}` : ''}. Rebuild and re-sign the shell package.`,
    );
  };
  const uint64 = (offset) => {
    const value = archive.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail();
    return Number(value);
  };
  let end = archive.length - 22;
  for (; end >= Math.max(0, archive.length - 65557); end--) {
    if (
      archive.readUInt32LE(end) === 0x06054b50 &&
      end + 22 + archive.readUInt16LE(end + 20) === archive.length
    )
      break;
  }
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50) fail();
  let count = archive.readUInt16LE(end + 10),
    offset = archive.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) {
    if (end < 20 || archive.readUInt32LE(end - 20) !== 0x07064b50) fail();
    const zip64 = uint64(end - 12);
    if (archive.readUInt32LE(zip64) !== 0x06064b50) fail();
    count = uint64(zip64 + 32);
    offset = uint64(zip64 + 48);
  }
  const contents = unzipSync(archive);
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) fail();
    const method = archive.readUInt16LE(offset + 10),
      flags = archive.readUInt16LE(offset + 8);
    const nameLength = archive.readUInt16LE(offset + 28),
      extraLength = archive.readUInt16LE(offset + 30);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    let size = archive.readUInt32LE(offset + 24),
      compressed = archive.readUInt32LE(offset + 20),
      local = archive.readUInt32LE(offset + 42);
    if ([size, compressed, local].includes(0xffffffff)) {
      let extra = offset + 46 + nameLength,
        limit = extra + extraLength;
      for (
        ;
        extra < limit && archive.readUInt16LE(extra) !== 1;
        extra += 4 + archive.readUInt16LE(extra + 2)
      ) {
        // Advance to the ZIP64 extra field.
      }
      if (extra >= limit) fail(name);
      extra += 4;
      if (size === 0xffffffff) {
        size = uint64(extra);
        extra += 8;
      }
      if (compressed === 0xffffffff) {
        compressed = uint64(extra);
        extra += 8;
      }
      if (local === 0xffffffff) local = uint64(extra);
    }
    const content = contents[name];
    if (!content || content.length !== size || crc32(content) !== archive.readUInt32LE(offset + 16))
      fail(name);
    if (
      archive.readUInt32LE(local) !== 0x04034b50 ||
      archive.readUInt16LE(local + 8) !== method ||
      archive.readUInt16LE(local + 6) !== flags
    )
      fail(name);
    if (
      !(flags & 8) &&
      (archive.readUInt32LE(local + 14) !== archive.readUInt32LE(offset + 16) ||
        ![size, 0xffffffff].includes(archive.readUInt32LE(local + 22)) ||
        ![compressed, 0xffffffff].includes(archive.readUInt32LE(local + 18)))
    )
      fail(name);
    offset += 46 + nameLength + extraLength + archive.readUInt16LE(offset + 32);
  }
  return contents;
}
