/** Deterministic textured subject, with no external media/licensing dependency. */
export function movingSubjectFrames(count = 24, width = 160, height = 90) {
  const bytes = new Uint8Array(count * width * height);
  bytes.fill(24);
  for (let frame = 0; frame < count; frame++)
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++)
        bytes[frame * width * height + (20 + y) * width + 20 + frame * 2 + x] =
          60 + ((x * 37 + y * 51) % 180);
  return bytes;
}
