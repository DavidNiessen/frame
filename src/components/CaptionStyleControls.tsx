import { TransientMessage } from './TransientMessage';
import { useEffect, useState } from 'react';
import { captionFonts, defaultCaptionStyle, systemFontFamily, type CaptionStyle } from '../core/caption-style';
import { FontPicker } from './FontPicker';
let installed: Promise<string[]> | undefined;
export function CaptionStyleControls({ value, change, selectable }: { value?: CaptionStyle; change: (style: CaptionStyle) => void; selectable: boolean }) {
  const style = value ?? defaultCaptionStyle;
  const [fonts, setFonts] = useState<string[]>([]), [error, setError] = useState('');
  const desktop = !!window.frameDesktop, family = systemFontFamily(style);
  useEffect(() => {
    let active = true;
    if (window.frameDesktop) {
      installed ??= window.frameDesktop.installedFonts().catch(error => { installed = undefined; throw error; });
      void installed.then(fonts => { if (active) setFonts(fonts.filter(font => !captionFonts.some(bundled => bundled.family === font))); }).catch(() => { if (active) setError('Installed fonts could not be loaded. Bundled fonts are available.'); });
    }
    return () => { active = false; };
  }, []);
  const options = [...captionFonts.map(font => ({ value: font.id, name: font.name, group: 'Bundled fonts' })), ...fonts.map(font => ({ value: `system:${font}`, name: font, group: 'Installed on this device' }))];
  const update = (patch: Partial<CaptionStyle>) => change({ ...style, ...patch });
  return <fieldset className="caption-appearance" disabled={selectable}><legend>Appearance</legend>
    {selectable && <p className="field-note">Appearance applies when burned into video. Selectable captions use the player’s styling.</p>}
    <FontPicker value={style.font} options={options} unavailable={family && `${family} · ${desktop ? 'Unavailable on this device' : 'Desktop font'}`} change={font => update({ font: font as CaptionStyle['font'] })} />
    {error && <TransientMessage className="field-note" role="status">{error}</TransientMessage>}
    {family && (!desktop || fonts.length > 0 && !fonts.includes(family)) && <p className="field-note">Choose a bundled font to preview and export this caption on this device.</p>}
    <label className="stacked-label">Font size · {style.size.toFixed(1)}% of frame width<input type="range" aria-label="Caption font size" min={1} max={12} step={.1} value={style.size} onChange={event => update({ size: Number(event.target.value) })} /></label>
    <div className="caption-style-toggles"><label><input type="checkbox" checked={style.bold} onChange={event => update({ bold: event.target.checked })} />Bold</label><label><input type="checkbox" checked={style.italic} onChange={event => update({ italic: event.target.checked })} />Italic</label></div>
    <label className="stacked-label">Alignment<select aria-label="Alignment" value={style.align} onChange={event => update({ align: event.target.value as CaptionStyle['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <div className="caption-color-grid"><label>Text color<input type="color" aria-label="Caption text color" value={style.color} onChange={event => update({ color: event.target.value })} /></label><label>Background color<input type="color" aria-label="Caption background color" value={style.background} onChange={event => update({ background: event.target.value })} /></label></div>
    <label className="stacked-label">Background opacity · {Math.round(style.backgroundOpacity * 100)}%<input type="range" aria-label="Caption background opacity" min={0} max={1} step={.01} value={style.backgroundOpacity} onChange={event => update({ backgroundOpacity: Number(event.target.value) })} /></label>
    <label className="switch-row">Text outline<input type="checkbox" checked={style.outline} onChange={event => update({ outline: event.target.checked })} /></label>
    {style.outline && <label className="caption-outline-color">Outline color<input type="color" aria-label="Caption outline color" value={style.outlineColor} onChange={event => update({ outlineColor: event.target.value })} /></label>}
  </fieldset>;
}
