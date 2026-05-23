export interface EffectPreset {
  readonly key: string;
  readonly matchName: string;
  readonly displayName: string;
  readonly category:
    | 'transition'
    | 'color'
    | 'zoom'
    | 'text'
    | 'audio'
    | 'speed'
    | 'distort'
    | 'stylize';
  readonly description: string;
  readonly defaultParams?: Readonly<Record<string, unknown>>;
}

export const EFFECT_PRESETS: readonly EffectPreset[] = [
  // ─── Transitions (10) ────────────────────────────────────────────────────
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
    key: 'dip_to_white',
    matchName: 'DipToWhite',
    displayName: 'Dip to White',
    category: 'transition',
    description: 'Fade through white',
  },
  {
    key: 'film_dissolve',
    matchName: 'FilmDissolve',
    displayName: 'Film Dissolve',
    category: 'transition',
    description: 'Soft cinematic dissolve',
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
  {
    key: 'morph_cut',
    matchName: 'MorphCut',
    displayName: 'Morph Cut',
    category: 'transition',
    description: 'Seamlessly hide a jump cut in talking heads',
  },
  {
    key: 'slide_left',
    matchName: 'Slide:Left',
    displayName: 'Slide Left',
    category: 'transition',
    description: 'Push next clip in from the right',
  },
  {
    key: 'iris_round',
    matchName: 'IrisRound',
    displayName: 'Iris Round',
    category: 'transition',
    description: 'Circular reveal',
  },
  {
    key: 'page_turn',
    matchName: 'PageTurn',
    displayName: 'Page Turn',
    category: 'transition',
    description: 'Old-school page-flip',
  },

  // ─── Zoom / Motion (8) ───────────────────────────────────────────────────
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
  {
    key: 'zoom_pulse',
    matchName: 'ZoomPulse',
    displayName: 'Zoom Pulse',
    category: 'zoom',
    description: 'Rhythmic zoom in/out for beat sync',
  },
  {
    key: 'ken_burns',
    matchName: 'KenBurns',
    displayName: 'Ken Burns',
    category: 'zoom',
    description: 'Slow pan + zoom on still images',
  },
  {
    key: 'shake',
    matchName: 'CameraShake',
    displayName: 'Camera Shake',
    category: 'zoom',
    description: 'Punchy handheld feel',
  },
  {
    key: 'parallax',
    matchName: 'Parallax',
    displayName: 'Parallax',
    category: 'zoom',
    description: '3D-style depth motion',
  },
  {
    key: 'tilt_shift',
    matchName: 'TiltShift',
    displayName: 'Tilt Shift',
    category: 'zoom',
    description: 'Miniature-faking depth blur',
  },
  {
    key: 'lens_distort',
    matchName: 'LensDistort',
    displayName: 'Lens Distort',
    category: 'zoom',
    description: 'Wide-angle barrel exaggeration',
  },

  // ─── Color / Lumetri (12) ────────────────────────────────────────────────
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
  {
    key: 'noir_high_contrast',
    matchName: 'Lumetri:Noir',
    displayName: 'Noir High Contrast',
    category: 'color',
    description: 'Black & white with crushed blacks',
  },
  {
    key: 'pastel_dream',
    matchName: 'Lumetri:PastelDream',
    displayName: 'Pastel Dream',
    category: 'color',
    description: 'Soft pastels, low contrast',
  },
  {
    key: 'sunset_glow',
    matchName: 'Lumetri:SunsetGlow',
    displayName: 'Sunset Glow',
    category: 'color',
    description: 'Warm magenta highlights',
  },
  {
    key: 'cold_drama',
    matchName: 'Lumetri:ColdDrama',
    displayName: 'Cold Drama',
    category: 'color',
    description: 'Cool blue shadows, crushed midtones',
  },
  {
    key: 'tech_blue',
    matchName: 'Lumetri:TechBlue',
    displayName: 'Tech Blue',
    category: 'color',
    description: 'Crisp blue tech aesthetic for screen recordings',
  },
  {
    key: 'vintage_kodak',
    matchName: 'Lumetri:Kodak2393',
    displayName: 'Vintage Kodak',
    category: 'color',
    description: 'Film stock emulation',
  },
  {
    key: 'matrix_green',
    matchName: 'Lumetri:MatrixGreen',
    displayName: 'Matrix Green',
    category: 'color',
    description: 'Heavy green cast',
  },
  {
    key: 'bw_documentary',
    matchName: 'Lumetri:BWDocumentary',
    displayName: 'B&W Documentary',
    category: 'color',
    description: 'Neutral black & white',
  },

  // ─── Text / MOGRT (8) ────────────────────────────────────────────────────
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
  {
    key: 'lower_third_news',
    matchName: 'MOGRT:LowerThirdNews',
    displayName: 'Lower Third (News)',
    category: 'text',
    description: 'Broadcast-style lower third',
  },
  {
    key: 'lower_third_modern',
    matchName: 'MOGRT:LowerThirdModern',
    displayName: 'Lower Third (Modern)',
    category: 'text',
    description: 'Sans-serif minimal lower third',
  },
  {
    key: 'callout_arrow',
    matchName: 'MOGRT:CalloutArrow',
    displayName: 'Callout Arrow',
    category: 'text',
    description: 'Arrow + text label for tutorials',
  },
  {
    key: 'chapter_card',
    matchName: 'MOGRT:ChapterCard',
    displayName: 'Chapter Card',
    category: 'text',
    description: 'Full-screen section divider',
  },
  {
    key: 'progress_bar',
    matchName: 'MOGRT:ProgressBar',
    displayName: 'Progress Bar',
    category: 'text',
    description: 'Animated progress bar overlay',
  },

  // ─── Audio (8) ───────────────────────────────────────────────────────────
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
  {
    key: 'audio_eq_voice',
    matchName: 'AudioEQ:Voice',
    displayName: 'EQ for Voice',
    category: 'audio',
    description: 'Boost vocal range, cut low rumble',
  },
  {
    key: 'audio_compress',
    matchName: 'AudioCompress',
    displayName: 'Compressor',
    category: 'audio',
    description: 'Even out loud/quiet parts',
  },
  {
    key: 'audio_denoise',
    matchName: 'AudioDenoise',
    displayName: 'De-noise',
    category: 'audio',
    description: 'Remove constant background noise',
  },
  {
    key: 'audio_reverb_room',
    matchName: 'AudioReverb:Room',
    displayName: 'Room Reverb',
    category: 'audio',
    description: 'Subtle room ambience',
  },
  {
    key: 'audio_telephone',
    matchName: 'AudioFilter:Telephone',
    displayName: 'Telephone Filter',
    category: 'audio',
    description: 'Narrow-band lo-fi voice effect',
  },

  // ─── Speed / Time (5) ────────────────────────────────────────────────────
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
  {
    key: 'reverse',
    matchName: 'Reverse',
    displayName: 'Reverse',
    category: 'speed',
    description: 'Play the clip backwards',
  },
  {
    key: 'slow_motion_2x',
    matchName: 'Speed:0.5',
    displayName: 'Slow-Mo 2×',
    category: 'speed',
    description: '50% playback with frame blending',
  },
  {
    key: 'fast_forward_4x',
    matchName: 'Speed:4.0',
    displayName: 'Fast Forward 4×',
    category: 'speed',
    description: '4× playback',
  },

  // ─── Distort (4) ────────────────────────────────────────────────────────
  {
    key: 'glitch',
    matchName: 'Distort:Glitch',
    displayName: 'Glitch',
    category: 'distort',
    description: 'Digital glitch with chromatic aberration',
  },
  {
    key: 'vhs_track',
    matchName: 'Distort:VHS',
    displayName: 'VHS Track',
    category: 'distort',
    description: 'Old VHS scan lines + noise',
  },
  {
    key: 'shake_hit',
    matchName: 'Distort:ShakeHit',
    displayName: 'Hit Shake',
    category: 'distort',
    description: 'Punch impact frame shake',
  },
  {
    key: 'rgb_split',
    matchName: 'Distort:RGBSplit',
    displayName: 'RGB Split',
    category: 'distort',
    description: 'Chromatic offset stylize',
  },

  // ─── Stylize (5) ────────────────────────────────────────────────────────
  {
    key: 'film_grain',
    matchName: 'Stylize:FilmGrain',
    displayName: 'Film Grain',
    category: 'stylize',
    description: 'Add cinematic grain overlay',
  },
  {
    key: 'vignette_soft',
    matchName: 'Stylize:VignetteSoft',
    displayName: 'Soft Vignette',
    category: 'stylize',
    description: 'Edge darkening for focus',
  },
  {
    key: 'light_leak',
    matchName: 'Stylize:LightLeak',
    displayName: 'Light Leak',
    category: 'stylize',
    description: 'Random warm light flare',
  },
  {
    key: 'duotone',
    matchName: 'Stylize:Duotone',
    displayName: 'Duotone',
    category: 'stylize',
    description: 'Two-color gradient look',
  },
  {
    key: 'paper_texture',
    matchName: 'Stylize:PaperTexture',
    displayName: 'Paper Texture',
    category: 'stylize',
    description: 'Old-paper noise overlay',
  },
];

export function listPresetsByCategory(category: EffectPreset['category']): readonly EffectPreset[] {
  return EFFECT_PRESETS.filter((p) => p.category === category);
}

export function findPreset(key: string): EffectPreset | undefined {
  return EFFECT_PRESETS.find((p) => p.key === key);
}

export function findPresetByMatchName(matchName: string): EffectPreset | undefined {
  return EFFECT_PRESETS.find((p) => p.matchName === matchName);
}

export function listAllCategories(): readonly EffectPreset['category'][] {
  return Array.from(new Set(EFFECT_PRESETS.map((p) => p.category)));
}

export function presetCount(): number {
  return EFFECT_PRESETS.length;
}
