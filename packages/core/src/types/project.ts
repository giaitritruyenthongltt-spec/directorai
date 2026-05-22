import type { Sequence } from './sequence.js';

export interface ProjectId {
  readonly value: string;
  readonly __brand: 'ProjectId';
}

export interface ProjectMetadata {
  readonly name: string;
  readonly path: string;
  readonly createdAt: string;
  readonly modifiedAt: string;
}

export interface Project {
  readonly id: ProjectId;
  readonly metadata: ProjectMetadata;
  readonly sequences: readonly Sequence[];
  readonly activeSequenceId: string | null;
}
