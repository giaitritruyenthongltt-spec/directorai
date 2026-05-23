import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IPremiereAdapter } from '@directorai/premiere-adapter';
import { dispatchRpc, listRpcMethods } from './rpc-dispatcher.js';
import { CONTEXT_TOOL_DESCRIPTIONS } from './context-router.js';

export interface McpToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Tool['inputSchema'];
  run(args: unknown, adapter: IPremiereAdapter): Promise<unknown>;
}

const passthroughDescriptions: Record<string, string> = {
  'project.get': 'Get the active Premiere project metadata and sequence list.',
  'project.listSequences': 'List all sequences in the active project.',
  'project.setActiveSequence': 'Set which sequence is active in Premiere.',
  'project.getActiveSequence': 'Get the currently active sequence.',
  'timeline.listClips': 'List all clips in a sequence.',
  'timeline.getClip': 'Get a single clip by id.',
  'timeline.cutClip': 'Split a clip at a given timeline second.',
  'timeline.trimClip': "Change a clip's timeline in/out points.",
  'timeline.moveClip': 'Move a clip to a new start time and optionally a new track.',
  'timeline.deleteClip': 'Remove a clip from the timeline.',
  'effect.apply': 'Apply a video/audio effect to a clip by Adobe match name.',
  'effect.remove': 'Remove an effect from a clip.',
  'media.import': 'Import a media file into the active project bin.',
  'marker.add': 'Add a marker to a sequence at a given second.',
  'marker.list': 'List all markers on a sequence.',
  'marker.delete': 'Delete a marker from a sequence.',
  'export.sequence': 'Export a sequence to disk using a preset.',
  'keyframe.add': 'Add a keyframe to an effect parameter at a specific time.',
  'color.applyPreset': 'Apply a Lumetri color preset to a clip.',
  'color.setParams': 'Set color grading parameters (exposure, contrast, etc.) on a clip.',
  'audio.setGain': 'Set the audio gain (in dB) of a clip.',
  'audio.addFade': 'Add an audio fade-in or fade-out to a clip.',
  'audio.muteTrack': 'Mute or unmute an audio track.',
  'text.addOverlay': 'Add a text overlay to the timeline as a title clip.',
  'transition.apply': 'Apply a transition between two adjacent clips.',
  'transition.list': 'List available transition presets.',
  'tracks.list': 'List all tracks in a sequence.',
  'undo.begin': 'Begin an undo group — all subsequent edits become one undo step.',
  'undo.end': 'End the current undo group.',
};

export const mcpTools: McpToolDef[] = listRpcMethods().map((name) => ({
  name: name.replace('.', '_'),
  description: passthroughDescriptions[name] ?? `RPC method: ${name}`,
  inputSchema: { type: 'object' as const },
  run: (args, adapter) => dispatchRpc(name, args, adapter),
}));

/**
 * Build the MCP tool catalog with the context.* methods spliced in.
 * Context tools don't go through the Premiere adapter — they need the
 * server-side context router supplied at runtime.
 */
export function buildMcpToolsWithContext(
  contextDispatch: (method: string, params: unknown) => Promise<unknown>
): McpToolDef[] {
  const contextNames = Object.keys(CONTEXT_TOOL_DESCRIPTIONS);
  const contextTools: McpToolDef[] = contextNames.map((name) => ({
    name: name.replace('.', '_'),
    description: CONTEXT_TOOL_DESCRIPTIONS[name] ?? `Context method: ${name}`,
    inputSchema: { type: 'object' as const },
    run: (args) => contextDispatch(name, args),
  }));
  return [...mcpTools, ...contextTools];
}
