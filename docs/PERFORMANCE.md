# Preview performance

Frame keeps export settings separate from playback optimizations:

- EQ and volume preview use a shared Web Audio route, including independent timed EQ instances. Ordinary EQ/gain edits do not encode the video. Noise reduction, normalization, visual corrections and rendered mixes still use FFmpeg when required.
- Eligible video previews scale to a maximum 720-pixel edge before expensive color/visual filters. Pixel-based blur and pixelation parameters scale with the preview. Geometry-dependent compositions retain their existing processing order. Exports keep their selected resolution and full effect settings.
- Desktop playback renders automatically try a tested hardware encoder, with portable software encoding as fallback.
- Continuous cut previews seek directly to excerpts, with up to eight independent inputs. More fragmented sequences use a shared input bounded to the retained source envelope.
- Contiguous splits with identical settings share preview processing. Local clip fades remain independent.
- The last three video/audio preview recipes are retained within a 96 MiB cache budget. The currently displayed preview is retained even if it alone exceeds that budget. Undo can reuse a completed render; switching source or clearing the workspace releases its cache.
- Browser preview workers remain loaded between completed jobs. WORKERFS reads the main source from Blob slices rather than first copying the entire movie into the virtual filesystem. A memory-filesystem fallback supports alternate FFmpeg cores. Cancellation still terminates an active worker; output and auxiliary temporary files are removed after each render.
- Published editor recipes reuse clip positions and durations through playback. Mutable import/edit drafts are not cached. Video UI updates follow decoded frames; audio uses the animation-frame clock.
- Waveform generation computes overall peaks rather than every available per-channel audio statistic. Source waveforms remain reusable through trim/split edits.

## Local measurement

One Linux cloud-workspace comparison used the same bundled FFmpeg, source, recipe and output format before/after the changes:

| Workload                                                                                       |    Before |    After |
| ---------------------------------------------------------------------------------------------- | --------: | -------: |
| 8-second 1920 × 1080, 30 fps H.264 preview; exposure 0.5, vignette 0.4, blur 2, saturation 1.2 | 13,525 ms | 3,075 ms |
| Stereo waveform peaks for 120 seconds of 1 kHz PCM audio                                       |    633 ms |   243 ms |

An isolated timing-read benchmark with 1,000 clips (300 repeated reads) dropped from 222.14 ms to 1.53 ms by reusing the published sequence timing. This measures timing lookup work, rather than end-to-end playback.

These are workload measurements, not guarantees for other machines or effect combinations. Regression tests also exercise real FFmpeg output, live audio, browser file mounting/runtime reuse, and cache cleanup.

Heavy effects and compositions can still require a full retained-sequence render. Preview/export time continues to depend on duration, codecs, dimensions, layers, effects, and hardware. Browser processing remains subject to WebAssembly memory limits.
