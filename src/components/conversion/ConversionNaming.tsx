import type { Conversion } from '../../hooks/useConversion';
import { conversionName } from '../../core/conversion';
export function ConversionNaming({ conversion: c }: { conversion: Conversion }) {
  const asset = c.selected[0]; let preview = '';
  try { if (asset) preview = conversionName(asset, c.output.format, c.keepFolders, c.namingTemplate, c.batch.orderFor(c.ids).indexOf(asset.id) + 1); } catch {}
  return <div className="conversion-naming"><label className="stacked-label">Filename pattern<input type="text" aria-label="Conversion filename pattern" maxLength={160} value={c.namingTemplate} onChange={event => c.setNamingTemplate(event.target.value)} /></label><p className="field-note">Use {'{name}'}, {'{index}'}, {'{format}'} or {'{folder}'}. The extension is added automatically.</p>{preview && <p className="field-note" aria-label="Output filename preview">Example: <strong>{preview}</strong></p>}<button className="button subtle small" onClick={() => c.setNamingTemplate('{name}')}>Keep original filenames</button><p className="field-note">Numbering follows queue order and stays the same when retrying.</p></div>;
}
