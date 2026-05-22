export interface EffectPreset {
  readonly key: string;
  readonly matchName: string;
  readonly displayName: string;
  readonly category: 'transition' | 'color' | 'zoom' | 'text' | 'audio' | 'speed';
  readonly description: string;
  readonly defaultParams?: Readonly<Record<string, unknown>>;
}

export const EFFECT_PRESETS: readonly EffectPreset[] = [
  // Transitions
  {
    key: 'cross_dissolve',
    matchName: 'CrossDissolve',
    displayName: 'Cross Dissolve',
    category: 'transition',
    description: 'Smooth fade between clips',
  },
  {
    key: 'dip_to_black',
    matchName: 'DipToBlack',
    displayName: 'Dip to Black',
    category: 'transition',
    description: 'Fade through black',
  },
  {
    key: 'whip_pan',
    matchName: 'WhipPan',
    displayName: 'Whip Pan',
    category: 'transition',
    description: 'Fast horizontal motion blur',
  },
  {
    key: 'cross_zoom',
    matchName: 'CrossZoom',
    displayName: 'Cross Zoom',
    category: 'transition',
    description: 'Punchy zoom between clips',
  },
  // Zoom
  {
    key: 'zoom_punch',
    matchName: 'ZoomPunch',
    displayName: 'Zoom Punch',
    category: 'zoom',
    description: 'Quick zoom-in on emphasized word',
    defaultParams: { amount: 1.15, durationSec: 0.3 },
  },
  {
    key: 'zoom_highlight',
    matchName: 'ZoomHighlight',
    displayName: 'Zoom Highlight',
    category: 'zoom',
    description: 'Sustained zoom on important screen area',
  },
  // Color
  {
    key: 'warm_vlog',
    matchName: 'Lumetri:WarmVlog',
    displayName: 'Warm Vlog',
    category: 'color',
    description: 'Light warmth + slight contrast',
  },
  {
    key: 'teal_orange',
    matchName: 'Lumetri:TealOrange',
    displayName: 'Teal & Orange',
    category: 'color',
    description: 'Cinematic split toning',
  },
  {
    key: 'punchy_vibrant',
    matchName: 'Lumetri:PunchyVibrant',
    displayName: 'Punchy Vibrant',
    category: 'color',
    description: 'High saturation, social-media ready',
  },
  {
    key: 'desaturated_film',
    matchName: 'Lumetri:DesaturatedFilm',
    displayName: 'Desaturated Film',
    category: 'color',
    description: 'Muted indie-film look',
  },
  // Text
  {
    key: 'big_bold_yellow',
    matchName: 'MOGRT:BigBoldYellow',
    displayName: 'Big Bold Yellow',
    category: 'text',
    description: 'Reels-style bold caption',
  },
  {
    key: 'clean_subtitle',
    matchName: 'MOGRT:CleanSubtitle',
    displayName: 'Clean Subtitle',
    category: 'text',
    description: 'Tutorial-friendly clean subtitle',
  },
  {
    key: 'kinetic_typography',
    matchName: 'MOGRT:KineticType',
    displayName: 'Kinetic Type',
    category: 'text',
    description: 'Animated emphasized words',
  },
  // Audio
  {
    key: 'audio_fade_in',
    matchName: 'AudioFade:in',
    displayName: 'Audio Fade In',
    category: 'audio',
    description: 'Smooth audio ramp from silence',
  },
  {
    key: 'audio_fade_out',
    matchName: 'AudioFade:out',
    displayName: 'Audio Fade Out',
    category: 'audio',
    description: 'Smooth audio ramp to silence',
  },
  {
    key: 'audio_ducking',
    matchName: 'AudioDuck',
    displayName: 'Audio Ducking',
    category: 'audio',
    description: 'Auto-lower music under voiceover',
  },
  // Speed
  {
    key: 'speed_ramp',
    matchName: 'SpeedRamp',
    displayName: 'Speed Ramp',
    category: 'speed',
    description: 'Gradual speed change',
  },
  {
    key: 'freeze_frame',
    matchName: 'FreezeFrame',
    displayName: 'Freeze Frame',
    category: 'speed',
    description: 'Pause on a single frame',
  },
];

export function listPresetsByCategory(category: EffectPreset['category']): readonly EffectPreset[] {
  return EFFECT_PRESETS.filter((p) => p.category === category);
}

export function findPreset(key: string): EffectPreset | undefined {
  return EFFECT_PRESETS.find((p) => p.key === key);
}

export function listAllCategories(): readonly EffectPreset['category'][] {
  return Array.from(new Set(EFFECT_PRESETS.map((p) => p.category)));
}
