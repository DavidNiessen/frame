# Preview performance

Frame keeps export settings separate from playback optimizations:

- Color, curves, LUTs and visual adjustments (including timed and per-clip instances) grade the playing video in real time with WebGL2. Edits update the next displayed frame instead of encoding a new preview. The shader follows the export filter order and FFmpeg's formulas; a regression test compares 18 corrections against the export filters within 3/255 mean error. Film grain, sketch and emboss are close approximations. Recipes with media layers, animated GIF sources and browsers without WebGL2 keep the rendered preview. Grading resolution follows the displayed size (at most 1920 pixels, or 960 with software WebGL).
- Image stacks made of adjustment layers (visual adjustments, color/LUT and curves, with crops, blend modes and opacity) grade the decoded original on the GPU for each edit. FFmpeg decodes the original once instead of compositing every change. A regression test compares crops and all nine blend modes against the export composite within 3/255 mean error. Stacks with text, shapes, paint, retouching, cutouts, media layers, masks or transforms keep the rendered composite.
- EQ and volume preview use a shared Web Audio route, including independent timed EQ instances. Ordinary EQ/gain edits do not encode the video. Noise reduction, normalization, visual corrections and rendered mixes still use FFmpeg when required.
- When a rendered preview is still required (noise reduction, normalization, audio and media layers), eligible video previews scale to a maximum 720-pixel edge before expensive color/visual filters. Pixel-based blur and pixelation parameters scale with the preview. Geometry-dependent compositions retain their existing processing order. Exports keep their selected resolution and full effect settings.
- Desktop playback renders automatically try a tested hardware encoder, with portable software encoding as fallback.
- Continuous cut previews and effect previews seek directly to retained excerpts, with up to eight independent inputs. Contiguous forward effect previews keep a single decoder. Larger assemblies retain the shared-input path.
- Contiguous splits with identical settings share preview processing. Local clip fades remain independent.
- The last three video/audio preview recipes are retained within a 96 MiB cache budget. The currently displayed preview is retained even if it alone exceeds that budget. Undo can reuse a completed render; switching source or clearing the workspace releases its cache.
- Image previews retain up to eight completed composites/backgrounds within a 64 MiB cache budget, plus the original comparison frame. Visible frames remain protected during handoffs. Text/object changes reuse unchanged backgrounds, undo/redo reuse completed composites, and the unchanged initial image reuses its original render. Compact SHA-256 recipe keys avoid retaining duplicate paint/mask data strings. Zoom and pan reuse the render request.
- Browser preview workers remain loaded between completed jobs. WORKERFS reads source files from Blob slices rather than first copying entire movies into the virtual filesystem. Imports, exports, merges, analysis, audio tracks and visual-layer inputs use scoped mounts; repeated references to the same File share a mount within each operation. A memory-filesystem fallback supports alternate FFmpeg cores. Cancellation still terminates an active worker; output and auxiliary temporary files are removed after each render.
- Published editor recipes reuse clip positions and durations through playback. Mutable import/edit drafts are not cached. Video UI updates follow decoded frames; audio uses the animation-frame clock.
- Edit history compares recipe values while skipping shared immutable objects and media strings. Each edit no longer serializes the entire recipe twice to check whether it changed.
- Waveform generation computes overall peaks rather than every available per-channel audio statistic. Source waveforms remain reusable through trim/split edits.

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

These are workload measurements, not guarantees for other machines or effect combinations. Regression tests also exercise real FFmpeg output, live audio, browser file mounting/runtime reuse, and cache cleanup.

Heavy effects and compositions can still require a full retained-sequence render. Preview/export time continues to depend on duration, codecs, dimensions, layers, effects, and hardware. Browser processing remains subject to WebAssembly memory limits.
