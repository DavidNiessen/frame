`electron-extraction.zip` contains a deflated 128 KiB file of deterministic bytes
generated with Python's `random.Random(42).randbytes(128 * 1024)`, stored as
`nested/runtime.bin`. It contains no executable or third-party media.

With Electron's original `extract-zip` / `yauzl` 2.10.0 dependencies on Node
24.16.0, extraction silently stops and the process exits successfully before its
promise completes. The fixture reproduces that failure without downloading an
Electron release. The test checks both completion and the extracted payload's
SHA-256. `yauzl` 3.4.0 completes the same extraction.
