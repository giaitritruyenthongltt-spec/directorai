export type Seconds = number & { readonly __brand: 'Seconds' };
export type Milliseconds = number & { readonly __brand: 'Milliseconds' };
export type FrameNumber = number & { readonly __brand: 'FrameNumber' };

export const seconds = (n: number): Seconds => n as Seconds;
export const ms = (n: number): Milliseconds => n as Milliseconds;
export const frame = (n: number): FrameNumber => n as FrameNumber;

export interface TimeRange {
  start: Seconds;
  end: Seconds;
}

export interface FrameRate {
  numerator: number;
  denominator: number;
}

export const FPS_24 = { numerator: 24, denominator: 1 } as const;
export const FPS_30 = { numerator: 30, denominator: 1 } as const;
export const FPS_60 = { numerator: 60, denominator: 1 } as const;
export const FPS_2997 = { numerator: 30000, denominator: 1001 } as const;
