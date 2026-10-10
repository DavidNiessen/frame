# Effect and trim interactions

The inspector follows the selected clip. Applied effects stay visible as a compact stack, with one section expanded for editing at a time. The separate effect browser adds tools; opening an existing effect does not silently re-enable it. Reset restores its neutral settings while leaving its controls open. Remove restores neutral settings and closes that section. Volume returns to 100%, speed to 1×, and fades to zero. Remove all clip effects uses one undo step and preserves source captions, watermarks and music tracks.

All clips includes effects applied to any individual clip. Different values show “Varies across clips”. Resetting an inherited effect on one clip leaves other clips unchanged. Neutral overrides from older projects do not generate empty timeline bars or effect badges.

Each effect bar names its effect and offers an × action. Clicking opens its inspector controls. Delete/Backspace removes a focused bar or effect heading; Undo restores it. Captions and music tracks have the same direct removal affordance. Very narrow bars hide the × to avoid covering their neighbours; zoom, Fit, the keyboard or the inspector remain available. Source watermarks and sequence fades are labeled separately from clip effects.

The timeline retains its scale while trimming; Fit explicitly frames the current sequence. Its axis expands when restored or slower footage needs more room. Adjacent trim handles stay inside their own clips, so either side of a cut can be grabbed without hitting its neighbour. A 0.05-second minimum prevents disappearing sections; floating-point tolerance keeps exact decimal boundaries valid for autosave and export. Faster clips need enough source footage to preserve that output minimum. Trimming and restoring outer edges remain available after shortening a split sequence.

Design references reviewed:

- [Premiere: Effect Controls panel](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-effects/about-effect-controls-panel.html): selected-clip controls with expandable effect sections.
- [Premiere: remove effects](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-effects/remove-effects-from-a-clip.html): selected effect removal, keyboard Delete, and removing attributes. Premiere retains fixed controls such as Volume; Frame resets their values and removes their timeline indicators.
- [Final Cut Pro: remove audio effects](https://support.apple.com/guide/final-cut-pro/remove-audio-effects-ver4d40b9cd6/mac): inspector-based effect removal and resetting built-in attributes to their defaults.
