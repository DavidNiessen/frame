# Whisper Tiny speech model

Pinned quantized ONNX weights and tokenizer/configuration files for local caption generation.

- Source: https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7
- Base model: https://huggingface.co/openai/whisper-tiny
- License: MIT; see `LICENSE.txt`.
- Total payload: approximately 42 MiB. The largest file is approximately 30 MiB.

`manifest.json` records SHA-256 checksums, byte sizes and upstream Git object IDs. The ONNX checksums were verified against Hugging Face's LFS SHA-256 IDs; JSON files were verified against their Git blob IDs from the pinned revision. Setup verifies every vendored file before copying it into the web assets. Desktop packages include the verified original model files as external resources. Builds and caption generation do not download model files from Hugging Face.

These are normal Git files, not Git LFS pointers. Updating the model requires replacing the pinned files, updating the manifest and inference revision, and repeating the real native/browser inference checks. Preserve the license and model source information.
