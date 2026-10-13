import { getFormat } from '../core/formats';
import { taggedNamingAsset } from '../core/media-tags';
import { validateNamingTemplate } from '../core/output-naming';
import { sampleRates } from '../core/audio-output';
import { useEffect, useRef, useState } from 'react';
import { canConvert, conversionSettings, conversionName } from '../core/conversion';
import { validateEdit } from '../core/export-plan';
import { outputSettings, parseOutputSettings, type OutputSettings } from '../core/presets';
import { defaultSettings, type MediaAsset } from '../core/types';
import { useBatch } from './useBatch';
import { useDownloadArchive } from './useDownloadArchive';
import type { Editor } from './useEditor';

const key = 'frame:conversion-output';
const sample: MediaAsset = {
  id: '',
  name: '',
  duration: 1,
  size: 0,
  kind: 'audio',
  hasAudio: true,
  previewUrl: '',
};
function readOutput() {
  try {
    const saved = localStorage.getItem(key);
    return saved ? parseOutputSettings(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

export function useConversion(editor: Editor) {
  const [saved] = useState(readOutput);
  const [output, setOutput] = useState<OutputSettings>(
    () => saved || outputSettings(defaultSettings(sample)),
  );
  const [artwork, setArtwork] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]),
    [keepFolders, setKeepFolders] = useState(true);
  const [namingTemplate, setNamingTemplate] = useState(() => {
    try {
      return localStorage.getItem('frame:conversion-naming') || '{name}';
    } catch {
      return '{name}';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('frame:conversion-naming', namingTemplate);
    } catch {}
  }, [namingTemplate]);
  const outputRef = useRef(output);
  outputRef.current = output;
  const known = useRef(new Set<string>()),
    manualFormat = useRef(!!saved);
  const batch = useBatch(editor);
  const archive = useDownloadArchive(batch.jobs);
  useEffect(() => {
    const current = new Set(editor.assets.map((asset) => asset.id));
    const format =
      !manualFormat.current && editor.assets.length
        ? editor.assets.every((asset) => asset.kind === 'image')
          ? 'png'
          : editor.assets.every((asset) => asset.kind === 'video')
            ? 'mp4'
            : 'mp3'
        : outputRef.current.format;
    const target = { ...outputRef.current, format } as OutputSettings;
    const added = editor.assets
      .filter((asset) => !known.current.has(asset.id) && canConvert(asset, target))
      .map((asset) => asset.id);
    setIds((ids) => [...new Set([...ids.filter((id) => current.has(id)), ...added])]);
    known.current = current;
    if (!manualFormat.current && editor.assets.length)
      setOutput((output) => ({ ...output, format }));
  }, [editor.assets]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(output));
    } catch {
      /* Settings still work for this session. */
    }
  }, [output]);
  const latestJobs = new Map(batch.jobs.map((job) => [job.asset.id, job]));
  const selected = editor.assets.filter(
    (asset) => ids.includes(asset.id) && latestJobs.get(asset.id)?.status !== 'done',
  );
  const incompatible = selected.filter((asset) => !canConvert(asset, output));
  let error = '';
  if (incompatible.length)
    error = `${incompatible.length} selected ${incompatible.length === 1 ? 'file is' : 'files are'} incompatible with ${output.format.toUpperCase()}. Choose another format or deselect them.`;
  else if (selected.length) {
    try {
      for (const asset of selected) validateEdit(asset, conversionSettings(asset, output));
    } catch (issue) {
      error = issue instanceof Error ? issue.message : 'Check the conversion settings.';
    }
  }
  try {
    validateNamingTemplate(namingTemplate);
  } catch (issue) {
    error = issue instanceof Error ? issue.message : 'Check the filename pattern.';
  }
  const done = batch.jobs.filter((job) => job.status === 'done');
  const unfinished = batch.jobs.filter((job) => ['failed', 'cancelled'].includes(job.status));
  const busy = !!editor.busy || archive.busy;
  function update(patch: Partial<OutputSettings>) {
    if (patch.format) {
      manualFormat.current = true;
      const imageSwitch =
        (getFormat(patch.format).kind === 'image') !== (getFormat(output.format).kind === 'image');
      if (imageSwitch)
        setIds(
          editor.assets
            .filter((asset) => canConvert(asset, { ...output, format: patch.format! }))
            .map((asset) => asset.id),
        );
    }
    setOutput((output) => {
      const next = { ...output, ...patch };
      if (
        patch.format &&
        next.audioSampleRate !== null &&
        !sampleRates(next.format).includes(next.audioSampleRate)
      )
        next.audioSampleRate = null;
      return next;
    });
  }
  return {
    artwork,
    setArtwork,
    output,
    update,
    namingTemplate,
    setNamingTemplate,
    ids,
    setIds,
    keepFolders,
    setKeepFolders,
    selected,
    incompatible,
    error,
    busy,
    batch,
    archive,
    latestJobs,
    done,
    unfinished,
    filenameFor: (asset: MediaAsset) => {
      try {
        return conversionName(
          taggedNamingAsset(asset, output.outputTags),
          output.format,
          keepFolders,
          namingTemplate,
          batch.orderFor(ids).indexOf(asset.id) + 1,
        );
      } catch {
        return conversionName(
          taggedNamingAsset(asset, output.outputTags),
          output.format,
          keepFolders,
        );
      }
    },
    start: () => {
      if (!error && !busy)
        void batch.convert(
          selected.map((asset) => asset.id),
          output,
          keepFolders,
          namingTemplate,
          artwork,
        );
    },
    retry: () => {
      if (!error && !busy)
        void batch.convert(
          unfinished
            .filter((job) => selected.some((asset) => asset.id === job.asset.id))
            .map((job) => job.asset.id),
          output,
          keepFolders,
          namingTemplate,
          artwork,
        );
    },
    clear: () => {
      if (!busy) {
        archive.cancel();
        batch.clear();
      }
    },
    toggle: (id: string) =>
      setIds((current) =>
        current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
      ),
  };
}
export type Conversion = ReturnType<typeof useConversion>;
