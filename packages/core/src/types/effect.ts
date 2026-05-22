export type EffectKind = 'video' | 'audio' | 'transition' | 'color' | 'text';

export interface EffectParam {
  readonly name: string;
  readonly value: number | string | boolean;
}

export interface Effect {
  readonly id: string;
  readonly matchName: string;
  readonly displayName: string;
  readonly kind: EffectKind;
  readonly enabled: boolean;
  readonly params: readonly EffectParam[];
}
