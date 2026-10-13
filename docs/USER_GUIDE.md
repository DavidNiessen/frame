# Using Frame

## Editor

Import files or drop them into the app and select a source from the library. Sources stay separate from exported results. Clear library removes the current workspace and retained recovery copies; it does not delete original files or completed exports.

Drag a clip's edges to trim, its body to reorder, and click the timeline to seek. **Split** divides at the playhead; remove unwanted sections, then use **Join splits** to join retained neighbors. Deleted footage stays excluded. The mini timeline, zoom, snapping and Locate playhead help navigate long sequences. Right-click the timeline for selection, start/end, split, copy/paste and removal actions. Undo/redo restores edits in one step per gesture.

The player and timeline initially share the available height equally. Drag panel dividers to resize; panels scroll inside their own bounds. Fullscreen preview expands the player while leaving transport controls available. Settings can hide the mini timeline or disable automatic waveform generation.

### Effects and captions

The Effects catalogue stays visible. Add with **+**, double-click, Enter or a drop onto the timeline. Click an effect's bar to open its settings over the right panel. Changes apply immediately; playback and Space keep the overlay open.

Captions, watermarks, volume, EQ, noise reduction, color adjustments and fades support independent repeatable instances. Drag bars to move them and edges to resize them across clip splits. Crop, transforms, speed and loudness normalization are track-wide adjustments; adding them again opens the existing settings. Splitting a clip does not duplicate its track effects.

Right-click an effect bar to remove it. Delete/Backspace and the overlay's Remove action are alternatives. Reset restores neutral values while preserving the effect instance. Video effects use a fixed processing order; arbitrary parameter keyframes are not supported yet. Image layers can be reordered.

Each caption is an independent effect. Click it in the player to open settings, double-click its text or press F2 to edit inline, and drag its frame/corner handles to position and resize. Enter commits text, Shift+Enter inserts a line break, and Escape cancels. Styling includes font, size, colors and alignment. Desktop can use installed fonts; web uses the bundled families. Caption tools import SRT cues, find/replace text and export SRT. Burn-in renders captions into the output; sidecar export keeps text separate.

### Insert video or replace audio

To extend a video, select it and use another video's Insert action or drop that source onto the timeline. Frame prepares a working MP4 sequence at the first video's dimensions/frame rate. This preparation re-encodes; original sources remain in the library and insertion supports undo.

To replace a video's audio with an MP3:

1. Import both files and select the video.
2. Add a Volume effect and set it to zero to mute the original soundtrack.
3. Insert the MP3 from the library to create an audio layer.
4. Drag the layer's bar to align it. Click the bar to adjust volume, source excerpt, looping, fades or ducking.
5. Export the video with the new audio.

**Project tools → Extract audio** adds the video's full original audio as a separate FLAC source. It runs before editor trims/effects and does not modify the video.

### Projects and recovery

Automatic workspace recovery reopens retained media and edits locally. Settings can disable new automatic saves; existing saved workspaces still reopen until cleared. Storage quotas, private browsing, deleted files or cleared app/site data can prevent recovery.

Save a `.frame.json` project for a portable edit recipe. Project files do not embed original audio/video: import or relink missing originals when opening on another device. Autosave and manual projects are separate.

## Conversion

Choose **Convert**, then add files or a recursive folder. Desktop uses native folder selection; browser directory selection/drop depends on browser support. Non-media files are skipped and corrupt files are reported independently. The library supports up to 2,000 sources.

Select files, choose a common output format and quality, and open advanced options for bitrate, audio sample rate/channels, GIF settings, metadata or artwork. Artwork retention is enabled by default for formats that support it. Conversion uses the complete original sources and does not apply Editor drafts.

Desktop saves to one chosen folder. Web provides individual downloads and a ZIP. Keep folder structure preserves imported subfolders. Output names are numbered on collision, so existing files are not overwritten. Completed results remain available when a job fails or is cancelled; Retry unfinished files continues the remaining selection.

**Batch export** in project tools can instead export each editor draft, reuse current output settings, or apply the current edits to selected sources. **Merge clips** renders a new ordered output from source recipes, with optional crossfades. These are separate from editing a working sequence with Insert.

## URL imports

**Load from URL** accepts direct HTTP/HTTPS media downloads. Browser requests require CORS permission and HTTPS when the app is served over HTTPS. Desktop downloads to disk without CORS restrictions. Page links and streaming playlists are not raw media files.

Desktop also accepts individual public YouTube videos, Instagram Reels/video posts, TikTok videos (including share links), SoundCloud tracks, Vimeo videos, Dailymotion videos and Bandcamp tracks. Paste a link to see its service and import options. Video links offer video/audio and quality choices; SoundCloud and Bandcamp automatically use the best available audio. Audio-only imports extract sound from video when separate audio streams are unavailable. Its bundled yt-dlp and FFmpeg run locally without a backend. Profiles, playlists, albums, Instagram carousels, live streams, cookie extraction and account sign-in are not supported. Services may block downloads or require authentication; Frame reports the failure with the service name. Bandcamp imports use the publicly available stream, not purchased downloads. Use media you have permission to download and edit.

URLs and authentication tokens are not stored in project files or autosave. Downloaded media may be retained locally for recovery; clear the library to remove Frame's retained copies, or export a separate copy to keep it.

## File-manager actions

### Windows

The installer offers **Edit in Frame** and **Convert in Frame** actions, enabled by default on first install. Upgrades remember the choice. Install, repair or remove them in **Settings → File-manager actions**.

Classic actions work on Windows 10 and under Windows 11's **Show more options**. The x64 Windows 11 primary-menu extension also exposes them in the first menu, sometimes grouped under Frame. Enabling it may require **Trust certificate and enable menu**: review the certificate consent and approve Windows' administrator prompt. Developer Mode is not needed. Classic actions work without trusting the certificate.

Certificate trust applies to the local machine's Trusted People store, while menu registration is per user. Removing actions or uninstalling Frame preserves shared certificate trust; remove trust explicitly in Settings if desired. Silent installs never accept certificate trust automatically.

**Convert in Frame** opens a compact frameless converter above the taskbar/dock. Set the usual conversion options and start; it collapses during processing, closes after successful completion and expands for failed/cancelled results. The main editor remains independent.

### macOS and Linux

On macOS, install Frame in Applications, then install Finder Quick Actions from Settings or the Frame menu. Use **Quick Actions** or **Services** in Finder. Enable the services in macOS keyboard shortcut settings if hidden.

On Linux, Dolphin integration is optional. Keep the AppImage at a stable path and install the actions in Settings. Remove them before deleting/moving the app, or reinstall after moving it. Other Linux file managers are not integrated.

Development checkouts support file-manager actions through `npm run desktop` / `pnpm desktop`. Reinstall them after moving the checkout. Web shows these settings disabled.

## Shortcuts and settings

**Ctrl/Cmd + K** opens the command palette; the footer lists keyboard shortcuts. **Space** toggles playback when focused on controls or the timeline; text fields still accept spaces. **I/O** sets the selected clip's start/end at the playhead, and **comma/period** steps backward/forward.

Settings includes theme previews, automatic waveforms, mini-timeline visibility, autosave, desktop watch folders, completion notifications, recent exports and file-manager integration. System theme follows your device by default.

## Images

Import PNG, JPEG, WebP, BMP, TIFF or AVIF files. GIF remains an animated video source. Images open in a dedicated canvas; no playback controls or timeline are shown. Use **Fit** to frame the image, **1:1** for actual pixels, the zoom buttons to inspect detail, and drag a zoomed canvas to pan. **Before / after** shows the original file.

Add an effect with **+** or a double-click. Its settings open over the right panel. Each adjustment, text item and drawing appears in **Layers** below the canvas; click it to edit or use its trash button to remove it. Crop and transform have one shared instance. Color adjustments and painting support independent layers. Brush layers offer color, size, opacity, an eraser, undo stroke and clear. Text and watermark artwork can be moved and resized directly on the canvas. The layer list runs from top to bottom; raise or lower a layer to change its processing order. Crop and transform establish the canvas below the other layers. Rename, hide, lock or group layers; hidden layers are omitted from preview and export, while locking protects canvas gestures and settings. Groups can be collapsed, hidden or locked together. Canvas interactions update immediately, while visual adjustments render in the background.

Add **Shape** for rectangles, rounded rectangles, ellipses, lines or arrows. Adjust fill, stroke, opacity and rotation; use numerical position/size controls, alignment buttons, or drag the shape and its handles. Shapes are independent image layers or draggable timed video effects.

Open **Canvas guides and snapping** in the image toolbar or video transport controls to choose center lines, rule of thirds or a 10% safe area. Snapping is enabled by default and aligns moving shapes, text and artwork to canvas edges, centers and other frame objects. Hold **Alt/Option** while dragging to bypass it. Guides are editing aids and are omitted from exports.

Each image layer has **Blend mode** and **Opacity** controls. Use Multiply to darken, Screen to lighten, Overlay/Soft light/Hard light to add contrast, or Difference to compare layers. Blending and opacity preserve the surrounding image and its transparency.

Add **Curves** to edit RGB luminance or individual red, green and blue channels. Click the graph to add a point, drag to adjust, or use point navigation, arrow keys and numerical Input/Output values. Remove a middle point with Delete or Remove point. The histogram behind the graph samples the current decoded frame; transparent pixels are weighted by their alpha. Curves also work as independent timed video effects.

For image adjustments, choose a **Mask** to apply the effect selectively. Rectangle and ellipse masks can be moved and resized on the canvas or positioned numerically. Paint a selection uses an editable brush mask; an empty brush selection reveals no effect until painted. Adjust brush size/strength, erase or undo strokes, feather the edge, or invert the selection. Remove mask returns to the entire image. Mask controls apply to adjustment layers; text, artwork and painting already have their own shape/alpha. Masks are saved in projects and use the same processing for preview and export.

In **Convert**, select an image output and choose **Image size**. Built-in web, social-square, thumbnail and percentage sizes are available, and custom sizes can be saved by name. Longest edge and Fit inside preserve proportions; Crop to fill produces the target ratio; Stretch changes proportions. Only shrink larger images is enabled by default. Each selected file gets dimensions calculated from its own original size. Batch conversion still ignores Editor drafts.

Choose PNG, JPEG, WebP, BMP or TIFF for output. PNG is lossless, and WebP offers a lossless switch. JPEG and BMP flatten transparency onto your chosen background color. PNG, WebP and TIFF retain transparency, including through vignette and sketch adjustments. Image quality is separate from video bitrate settings. Use **Convert** to process a folder of images with one setup. The browser performs image processing locally using the same engine as other media. AVIF decoding depends on the engine; desktop handles codecs absent from the browser build.

Inputs support up to 32 megapixels and 16,384 pixels per side. Paint layers are rasterized up to 4,096 pixels per side and scaled to the output frame. Original files are preserved. Saved projects and workspace recovery retain image settings, text and paint layers.

### Image credits and privacy

Open **Export → Advanced settings → Image credits & privacy** to edit creator, copyright, and description. Untouched fields follow **Keep metadata**; clearing a field removes it. Camera information can be retained independently. GPS location is excluded by default and must be explicitly enabled. Original thumbnails and camera maker notes are omitted. These controls also work in bulk conversion and saved output presets. JPEG, PNG, WebP, and TIFF support EXIF; BMP does not.

### Clone and healing brushes

Add a **Retouch** layer. Alt/Option-click the image to choose a source, then paint over the area to repair. **Clone** copies texture, while **Heal** also matches the surrounding color. Adjust size, hardness, and opacity; **Erase** removes only this retouch layer. Each stroke keeps its source offset. Use **Undo retouch stroke**, **Clear retouch layer**, or project undo/redo. Sampling uses layers below Retouch, so later effects are not baked twice. Retouch is image-only and renders in a background worker.

### HEIC and camera RAW

Import HEIC/HEIF phone photos or common camera RAW files, including DNG, CR2/CR3, NEF/NRW, ARW, RAF, ORF, RW2, PEF, and SRW. The bundled decoders run locally in workers on desktop and web. No installed camera codecs or upload service is needed. Frame uses the primary HEIC image and develops RAW into 8-bit sRGB using the recorded camera white balance. Originals remain unchanged and are retained for automatic workspace recovery. All image editing effects and bulk conversion are available on the decoded image. Unsupported camera/compression combinations report an import error. HEIC/RAW inputs are limited to 128 MB; decoded images use the existing 32-megapixel limit.

### Remove an image background

Add **Remove background** for automatic edge-connected color removal. This local tool works best with plain or gently varying backgrounds; it does not use an AI model. Adjust **Color tolerance** and **Edge softness**, or choose **Pick background color** and click the canvas. Keep **Remove only connected background** enabled to preserve enclosed areas of similar color. Paint with **Restore area** or **Remove more** to refine the mask, and undo or clear refinements independently. Recalculate after changing layers below this effect. PNG, WebP, and TIFF preserve transparency; JPEG/BMP use the export background color. Original pixels remain unchanged.

### Independent video and image tracks

Use the **Layer** icon beside another library item to place it over the current video or image. The command palette also lists these actions. The separate **Insert** icon still appends a video to the end of a sequence. Each picture track has its own position, dimensions, fit, opacity, visual adjustments, and curves. Drag or resize its frame object; use **Fill frame**, **Center picture**, **Bring forward**, and **Send backward** in its overlay.

In video projects, drag a track bar to move it, use its edges to trim/expand within the source, and right-click for **Split here**, copy/paste, duplicate, or delete. A source video with sound creates a linked audio track; timing changes and splitting keep both synchronized. Mute its sound or unlink it in media layer settings. Image tracks can remain on screen for any portion of the sequence. Image projects show picture layers in the ordered Layers island, including hide/lock/group/blend controls. Up to 16 visual and 16 audio tracks are supported. Projects and autosave retain source references; original media stays unchanged.

### Motion and audio keyframes

Open a video/image track overlay in a video project and expand **Motion & keyframes**. Choose X/Y position, width, height, or opacity, then enable **Animate**. Move the playhead and change the value to add a keyframe. Numeric layout fields and frame gestures also record changes when that property is animated. Use linear, smooth ease, or hold interpolation, previous/next controls, and the keyframe time buttons. Diamonds mark animation times on the track. Audio overlays provide **Animate volume** with the same controls. Animation moves with its track, keeps its trajectory when trimmed/split, and is applied in editing previews and exports.
