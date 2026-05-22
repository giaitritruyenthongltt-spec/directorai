import type { Style } from './schema.js';

export const VLOG_STYLE: Style = {
  name: 'Vlog',
  description: 'Talking-head vlog: tight cuts, jump cuts on silences, light color.',
  version: '1.0',
  pacing: {
    hook: { durationSec: 3, cutsPerSec: 2 },
    body: { cutsPerSec: 0.8, beatSync: false },
    outro: { durationSec: 3, cutsPerSec: 1.5 },
  },
  effects: [],
  color: { preset: 'WarmVlog' },
  audio: { musicGainDb: -18, duckingDb: -6, fadeInSec: 0.5, fadeOutSec: 0.5 },
  removeFillers: true,
  removeSilence: true,
  silenceThresholdDb: -40,
  minSilenceSec: 0.4,
};

export const CINEMATIC_STYLE: Style = {
  name: 'Cinematic',
  description: 'Slow pacing, J/L cuts, teal-orange color, ambient music bed.',
  version: '1.0',
  pacing: {
    hook: { durationSec: 5, cutsPerSec: 0.3 },
    body: { cutsPerSec: 0.25, beatSync: false },
    outro: { durationSec: 5, cutsPerSec: 0.3 },
  },
  effects: [],
  color: { preset: 'TealOrange', saturation: 1.1, contrast: 1.05 },
  audio: { musicGainDb: -14, duckingDb: -8, fadeInSec: 1.5, fadeOutSec: 2.0 },
  removeFillers: false,
  removeSilence: false,
  silenceThresholdDb: -50,
  minSilenceSec: 1.0,
};

export const TECH_REEL_STYLE: Style = {
  name: 'Tech Reel',
  description: 'Punchy short-form: quick zooms, captions, beat-sync.',
  version: '1.0',
  pacing: {
    hook: { durationSec: 2, cutsPerSec: 3 },
    body: { cutsPerSec: 1.5, beatSync: true },
    outro: { durationSec: 2, cutsPerSec: 2 },
  },
  effects: [
    {
      on: 'keyword',
      keywords: ['AI', 'tool', 'plugin', 'workflow'],
      action: 'zoom_punch',
      durationSec: 0.4,
    },
    { on: 'beat', action: 'flash_cut' },
  ],
  color: { preset: 'PunchyVibrant', saturation: 1.2, contrast: 1.1 },
  text: { mogrt: 'BigBoldYellow', fontSize: 64, durationSec: 1.5 },
  audio: { musicGainDb: -10, duckingDb: -10, fadeInSec: 0.2, fadeOutSec: 0.2 },
  removeFillers: true,
  removeSilence: true,
  silenceThresholdDb: -38,
  minSilenceSec: 0.3,
};

export const PODCAST_STYLE: Style = {
  name: 'Podcast',
  description: 'Multi-cam podcast: minimal cuts, silence trim only.',
  version: '1.0',
  pacing: {
    hook: { durationSec: 3, cutsPerSec: 0.5 },
    body: { cutsPerSec: 0.2, beatSync: false },
    outro: { durationSec: 3, cutsPerSec: 0.5 },
  },
  effects: [],
  color: {},
  audio: { musicGainDb: -24, duckingDb: -4, fadeInSec: 0.5, fadeOutSec: 0.5 },
  removeFillers: true,
  removeSilence: true,
  silenceThresholdDb: -42,
  minSilenceSec: 0.6,
};

export const TUTORIAL_STYLE: Style = {
  name: 'Tutorial',
  description: 'Screen-recording focused: zoom highlights, callouts, clean text.',
  version: '1.0',
  pacing: {
    hook: { durationSec: 4, cutsPerSec: 0.5 },
    body: { cutsPerSec: 0.4, beatSync: false },
    outro: { durationSec: 4, cutsPerSec: 0.5 },
  },
  effects: [{ on: 'keyword', keywords: ['click', 'select', 'open'], action: 'zoom_highlight' }],
  color: { contrast: 1.05 },
  text: { mogrt: 'CleanSubtitle', fontSize: 36, durationSec: 2.5 },
  audio: { musicGainDb: -24, duckingDb: -2, fadeInSec: 1, fadeOutSec: 1 },
  removeFillers: true,
  removeSilence: true,
  silenceThresholdDb: -40,
  minSilenceSec: 0.5,
};

export const BUILTIN_STYLES: Record<string, Style> = {
  vlog: VLOG_STYLE,
  cinematic: CINEMATIC_STYLE,
  techReel: TECH_REEL_STYLE,
  podcast: PODCAST_STYLE,
  tutorial: TUTORIAL_STYLE,
};

export function listBuiltinStyles(): readonly string[] {
  return Object.keys(BUILTIN_STYLES);
}

export function getBuiltinStyle(name: string): Style {
  const s = BUILTIN_STYLES[name];
  if (!s) throw new Error(`Unknown built-in style: ${name}`);
  return s;
}
