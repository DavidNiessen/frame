# Preview performance

Frame keeps export settings separate from playback optimizations:

- Color, curves, LUTs and visual adjustments (including timed and per-clip instances) grade the playing video in real time with WebGL2. Edits update the next displayed frame instead of encoding a new preview. The shader follows the export filter order and FFmpeg's formulas; a regression test compares 18 corrections against the export filters within 3/255 mean error. Film grain, sketch and emboss are close approximations. Recipes with media layers, animated GIF sources and browsers without WebGL2 keep the rendered preview. Grading resolution follows the displayed size (at most 1920 pixels, or 960 with software WebGL).
- Image stacks made of adjustment layers (visual adjustments, color/LUT and curves, with crops, rotation, flips, shape-preserving resizes, blend modes and opacity) grade the decoded original on the GPU for each edit. FFmpeg decodes the original once instead of compositing every change. A regression test compares crops, rotated and flipped pictures and all nine blend modes against the export composite within 3/255 mean error. Stacks with text, shapes, paint, retouching, cutouts, media layers, masks or resizes that pad or cut the picture keep the rendered composite.
- EQ, volume and noise reduction preview use a shared Web Audio route, including independent timed instances. Ordinary EQ/gain edits do not encode the video. Noise reduction runs in an AudioWorklet (`spectral-denoise`: per-bin power subtraction against afftdn's white noise floor, 1024-sample STFT, 21 ms latency), within 1 dB of `afftdn` on white noise and within about 0.5 dB on tonal material, so it plays at once instead of after a 7-second soundtrack render. Normalization, visual corrections and rendered mixes still use FFmpeg when required.
- On video, corrections that only affect sound (normalization, audio tracks, and noise reduction without AudioWorklet) render just the soundtrack to MP3. The source video keeps playing, muted, and the rendered soundtrack follows its output time. Grading changes do not invalidate the soundtrack. Until the soundtrack is ready, the source audio plays with live gain and EQ. Media layers and grading without WebGL2 still render the whole picture.
- Video and image layers composite live in the player over rotated, flipped or resized video, and inside a simple crop. Each layer plays its own source in step with the output time, with its fit, opacity, keyframed position and the base video's fades; its curves and visual adjustments run on the GPU. Linked layer audio uses the audio-only render. A regression test compares a graded, semi-transparent layer with the exported frame, with a crop and over rotated, flipped video. Bases combining a crop with rotation, flips or resizing, GIF layers and browsers without WebGL2 keep the rendered composite.
- When a rendered video preview is still required (layers over a base that is both cropped and transformed, or grading without WebGL2), eligible video previews scale to a maximum 720-pixel edge before expensive color/visual filters. Pixel-based blur and pixelation parameters scale with the preview. Geometry-dependent compositions retain their existing processing order. Exports keep their selected resolution and full effect settings.
- Desktop playback renders automatically try a tested hardware encoder, with portable software encoding as fallback.
- Cuts, deleted sections and reordered clips play straight from the source, so playback starts at once instead of after re-encoding the whole timeline (about 2 minutes for a few-minute clip). A standby decoder cued on the next clip covers each cut's seek: on a 1080p file with 8-second keyframe intervals, the 225–250 ms seek showed no frozen frame. Rendered effect previews seek directly to retained excerpts, with up to eight independent inputs. Contiguous forward effect previews keep a single decoder. Larger assemblies retain the shared-input path.
- Contiguous splits with identical settings share preview processing. Local clip fades remain independent.
- The last three video/audio preview recipes are retained within a 96 MiB cache budget. The currently displayed preview is retained even if it alone exceeds that budget. Undo can reuse a completed render; switching source or clearing the workspace releases its cache.
- Image previews retain up to eight completed composites/backgrounds within a 64 MiB cache budget, plus the original comparison frame. Visible frames remain protected during handoffs. Text/object changes reuse unchanged backgrounds, undo/redo reuse completed composites, and the unchanged initial image reuses its original render. Compact SHA-256 recipe keys avoid retaining duplicate paint/mask data strings. Zoom and pan reuse the render request. A rendered layer stack is shown as FFmpeg wrote it, without a second full-size PNG encode, and intermediate stages use fast PNG compression.
- Browser preview workers remain loaded between completed jobs. WORKERFS reads source files from Blob slices rather than first copying entire movies into the virtual filesystem. Imports, exports, merges, analysis, audio tracks and visual-layer inputs use scoped mounts; repeated references to the same File share a mount within each operation. A memory-filesystem fallback supports alternate FFmpeg cores. Cancellation still terminates an active worker; output and auxiliary temporary files are removed after each render.
- Published editor recipes reuse clip positions and durations through playback. Mutable import/edit drafts are not cached. Video UI updates follow decoded frames; audio uses the animation-frame clock.
- Edit history compares recipe values while skipping shared immutable objects and media strings. Each edit no longer serializes the entire recipe twice to check whether it changed.
- Waveform generation computes overall peaks rather than every available per-channel audio statistic. Source waveforms remain reusable through trim/split edits.

## Export performance

- Desktop exports and joins use every CPU core for decoding, filtering and encoding. Previews, proxies and watch-folder conversions keep their two-thread limit so they stay in the background while you edit.

Same 4-core Linux cloud workspace and bundled FFmpeg, 60-second 1920 × 1080, 30 fps H.264 source with AAC audio, MP4 output at Balanced quality:

| Export                          | Two threads | All cores |
| ------------------------------- | ----------: | --------: |
| Trim to 50 seconds, no effects  |   34,321 ms | 23,568 ms |
| Cut 10 seconds from the middle  |   30,690 ms | 20,588 ms |
| Contrast 1.1 and saturation 1.3 |   42,306 ms | 26,781 ms |
| Crop to 1280 × 720              |   12,677 ms |  9,928 ms |

Machines with more cores gain more.

## Local measurement

One Linux cloud-workspace comparison used the same bundled FFmpeg, source, recipe and output format before/after the changes:

| Workload                                                                                       |    Before |    After |
| ---------------------------------------------------------------------------------------------- | --------: | -------: |
| 8-second 1920 × 1080, 30 fps H.264 preview; exposure 0.5, vignette 0.4, blur 2, saturation 1.2 | 13,525 ms | 3,075 ms |
| Stereo waveform peaks for 120 seconds of 1 kHz PCM audio                                       |    633 ms |   243 ms |

An isolated timing-read benchmark with 1,000 clips (300 repeated reads) dropped from 222.14 ms to 1.53 ms by reusing the published sequence timing. This measures timing lookup work, rather than end-to-end playback.

A later comparison isolated direct input seeking after the playback-resolution optimization: a four-second preview of source ranges 170–172 seconds followed by 0–2 seconds from a 180-second 1280 × 720, 15 fps H.264 source, with saturation 1.2. Two runs per version, in reversed order, measured 1,750/2,330 ms before and 194/243 ms after (medians 2,040 ms and 218.5 ms). Both outputs retained the same four-second duration.

An isolated change-detection benchmark compared 50 recipes sharing a synthetic 2 MiB paint payload (25 unchanged, 25 with changed volume). Two runs measured 1,094.06/1,025.25 ms using full JSON serialization and 4.05/2.34 ms using value/reference comparisons. Both methods classified the same 25 recipes as unchanged. This measures only change detection, not complete edit latency.

Real-time grading, web app in a CPU-only Linux container (software WebGL), 20-second 1920 × 1080, 30 fps H.264 source: changing color contrast took about 15.5 s per edit before (five edits: 16,331/15,455/15,521/15,544/15,711 ms until the re-rendered preview was playable). Afterwards, the time from changing the value to changed pixels on the preview canvas measured 46–131 ms (median 55 ms over seven edits). On GPU-accelerated WebGL the grading pass itself takes well under a frame.

Image adjustments in the same container: changing an Exposure layer on a 4000 × 3000 JPEG took 2.0–3.6 s per change before (five changes, until the new composite was displayed) and 50–103 ms afterwards (median 64 ms over seven changes, to changed canvas pixels).

Text edits on the same 4000 × 3000 JPEG took 1.50–1.56 s per change before and 1.00–1.05 s afterwards (four changes each, until the preview stopped reporting busy, as Playwright polls it). Timed in the page, a change now reaches the loaded composite in about 0.6 s, of which 180 ms is the typing debounce and about 0.3 s is FFmpeg.

Audio-only renders in the same container, same 20-second source: adding Noise reduction took 32.5 s before (until the re-rendered video was playable) and 7.0 s afterwards (until the rendered soundtrack was playable); then adding Normalize loudness took 30.3 s before and 3.3 s afterwards. Both include the 300 ms preview debounce and opening the effect.

Media layers in the same container: moving a video layer over the same 20-second source took 37–41 s per change before (three changes, until the re-rendered composite was playable). Afterwards the layer moved on screen 84–386 ms after the value changed (median 254 ms over five changes, while the other test suite was running), with no render.

These are workload measurements, not guarantees for other machines or effect combinations. Regression tests also exercise real FFmpeg output, live audio, browser file mounting/runtime reuse, and cache cleanup.

Heavy effects and compositions can still require a full retained-sequence render. Preview/export time continues to depend on duration, codecs, dimensions, layers, effects, and hardware. Browser processing remains subject to WebAssembly memory limits.
