import { trackMotion } from '../core/motion-tracking';
self.onmessage = (event) => {
  const { bytes, width, height, fps, region } = event.data;
  try {
    const result = trackMotion(new Uint8Array(bytes), width, height, fps, region, (ratio) =>
      self.postMessage({ ratio }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
