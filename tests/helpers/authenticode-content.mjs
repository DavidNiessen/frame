/** Authenticode hashes the value of SpcIndirectDataContent, excluding its SEQUENCE header.
 * Pass that exact content to OpenSSL: older S/MIME readers hash the header too.
 * OpenSSL still verifies the digest, signed attributes, signature and certificate chain.
 */
export function authenticodeContent(der) {
  function element(offset, tag) {
    if (der[offset] !== tag) throw new Error('Unexpected Authenticode ASN.1 tag.');
    let size = der[offset + 1],
      start = offset + 2;
    if (size & 128) {
      const count = size & 127;
      if (!count || count > 4 || start + count > der.length)
        throw new Error('Invalid Authenticode ASN.1 length.');
      size = 0;
      for (let i = 0; i < count; i++) size = size * 256 + der[start++];
    }
    if (!Number.isFinite(size) || start + size > der.length)
      throw new Error('Truncated Authenticode content.');
    return { start, end: start + size };
  }
  const root = element(0, 0x30),
    type = element(root.start, 0x06);
  const wrapper = element(type.end, 0xa0),
    signed = element(wrapper.start, 0x30);
  const version = element(signed.start, 0x02),
    algorithms = element(version.end, 0x31);
  const info = element(algorithms.end, 0x30),
    contentType = element(info.start, 0x06);
  const content = element(contentType.end, 0xa0),
    sequence = element(content.start, 0x30);
  return der.subarray(sequence.start, sequence.end);
}
