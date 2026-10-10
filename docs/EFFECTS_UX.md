# Effect and trim interactions

Frame follows Premiere’s separation between the Effects catalogue and selected-clip Effect Controls. The catalogue is a compact list of category bins with search. Single-click selects; double-click, Enter, +, or Apply applies to the visible target. Dragging a row onto a timeline clip targets that clip, while source effects retain their source scope. Applying keeps the catalogue in place and prepares the matching controls; the user explicitly switches to Effect Controls. Clicking a timeline effect opens its controls directly.

Effect Controls groups video, audio and time adjustments, with independently expandable sections. Built-in volume, speed and transforms remain attached to the clip and offer Reset. Standard effects offer Reset, Remove and Delete/Backspace. Reset restores neutral settings while retaining the added effect; Remove deletes membership and restores neutral settings. Added neutral effects survive undo, project files and autosave. Remove all clip effects uses one undo step, resets built-ins, and preserves trimming, source captions, watermarks and music tracks. Catalogue searches and controls remain mounted across navigation.

This matches Premiere’s catalogue/application/inspector interactions for Frame’s supported adjustments. The renderer still uses Frame’s validated FFmpeg recipe, with one instance of each supported adjustment and a fixed processing order. Arbitrary duplicate effect chains, general parameter keyframes, and Premiere’s Motion/Opacity toolset are separate rendering features; the interface does not offer controls that cannot render.

All clips includes effects applied to any individual clip. Different values show “Varies across clips”. Resetting an inherited effect on one clip leaves other clips unchanged. Neutral overrides from older projects do not generate empty timeline bars or effect badges.

Each effect bar names its effect and offers an × action. Clicking opens its inspector controls. Delete/Backspace removes a focused bar or effect heading; Undo restores it. Captions and music tracks have the same direct removal affordance. Very narrow bars hide the × to avoid covering their neighbours; zoom, Fit, the keyboard or the inspector remain available. Source watermarks and sequence fades are labeled separately from clip effects.

The timeline retains its scale while trimming; Fit explicitly frames the current sequence. Its axis expands when restored or slower footage needs more room. Adjacent trim handles stay inside their own clips, so either side of a cut can be grabbed without hitting its neighbour. A 0.05-second minimum prevents disappearing sections; floating-point tolerance keeps exact decimal boundaries valid for autosave and export. Faster clips need enough source footage to preserve that output minimum. Trimming and restoring outer edges remain available after shortening a split sequence.

Design references reviewed:

- [Premiere: apply effects](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-effects/apply-effects.html): select a clip, drag an effect onto it, then adjust it in Effect Controls.
- [Premiere: find and group effects](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-effects/find-and-group-effects.html): stable searchable category bins.
- [Premiere: Effect Controls panel](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-effects/about-effect-controls-panel.html): selected-clip controls with expandable effect sections.
- [Premiere: remove effects](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-effects/remove-effects-from-a-clip.html): selected effect removal, keyboard Delete, and removing attributes. Premiere retains fixed controls such as Volume; Frame resets their values and removes their timeline indicators.
- [Final Cut Pro: remove audio effects](https://support.apple.com/guide/final-cut-pro/remove-audio-effects-ver4d40b9cd6/mac): inspector-based effect removal and resetting built-in attributes to their defaults.
