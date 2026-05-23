/**
 * Natural-language router: takes a user message, runs an LLM tool-use
 * loop, executes Premiere tools via the supplied adapter, returns the
 * final assistant text + a transcript of what happened.
 *
 * Exposed as the `nl.query` RPC method.
 */

import type { Logger } from '@directorai/shared';
import { AnthropicClient } from '@directorai/llm-client';
import type { LLMToolDef, LLMAgentResponse } from '@directorai/llm-client';
import { dispatchRpc, listRpcMethods, type IPremiereAdapter } from '@directorai/premiere-adapter';

const SYSTEM_PROMPT = `You are DirectorAI, an AI editing copilot embedded in Adobe Premiere Pro.

You have a catalog of tools to inspect and modify the active Premiere project.
When the user asks something, use the tools to execute their intent step by step,
then summarize what you did in 1–2 sentences. Prefer batched edits inside a single
turn when possible. Speak the user's language. Be concise.`;

// Method names use dots in our RPC layer but Anthropic tool names must
// match /^[a-zA-Z0-9_-]+$/ — convert with snake_case-ish underscore.
const toToolName = (rpc: string): string => rpc.replace(/\./g, '_');
const fromToolName = (toolName: string): string => toolName.replace(/_/g, '.');

const ALWAYS_HIDE = new Set(['undo.begin', 'undo.end']);

export function buildToolCatalog(): readonly LLMToolDef[] {
  return listRpcMethods()
    .filter((m) => !ALWAYS_HIDE.has(m))
    .map((m) => ({
      name: toToolName(m),
      description: descriptionFor(m),
      // We don't ship the full Zod schema here — the dispatcher revalidates
      // params inside dispatchRpc. Pass a permissive object schema so the
      // LLM is allowed to send any JSON. Strong typing remains at dispatch.
      inputSchema: { type: 'object', additionalProperties: true },
    }));
}

const DESCRIPTIONS: Record<string, string> = {
  'project.get': 'Get the active Premiere project metadata and sequence list.',
  'project.listSequences': 'List all sequences in the active project.',
  'project.setActiveSequence': 'Activate a sequence by id.',
  'project.getActiveSequence': 'Get the currently active sequence.',
  'timeline.listClips': 'List all clips in a sequence.',
  'timeline.getClip': 'Get a single clip by id.',
  'timeline.cutClip': 'Split a clip at a given timeline second.',
  'timeline.trimClip': "Change a clip's timeline in/out points.",
  'timeline.moveClip': 'Move a clip to a new start time (and optionally a track).',
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
};

function descriptionFor(method: string): string {
  return DESCRIPTIONS[method] ?? `Premiere RPC method: ${method}`;
}

export interface NlRouterOptions {
  apiKey: string;
  model?: string;
  logger?: Logger;
}

export interface NlQueryInput {
  prompt: string;
  maxTurns?: number;
}

export interface NlQueryResult extends LLMAgentResponse {
  toolCallsExecuted: number;
}

export function createNlRouter(opts: NlRouterOptions) {
  const client = new AnthropicClient({ apiKey: opts.apiKey, model: opts.model });

  return async function query(
    input: NlQueryInput,
    adapter: IPremiereAdapter
  ): Promise<NlQueryResult> {
    const tools = buildToolCatalog();
    opts.logger?.info({ prompt: input.prompt, tools: tools.length }, 'nl.query start');

    const result = await client.runAgent({
      userPrompt: input.prompt,
      system: SYSTEM_PROMPT,
      tools,
      maxTurns: input.maxTurns ?? 8,
      execute: async (call) => {
        const rpcMethod = fromToolName(call.name);
        opts.logger?.debug({ tool: rpcMethod, input: call.input }, 'tool executing');
        const value = await dispatchRpc(rpcMethod, call.input, adapter);
        return JSON.stringify(value ?? null);
      },
    });

    opts.logger?.info(
      {
        stopReason: result.stopReason,
        turns: result.turns.length,
        toolCalls: result.toolResults.length,
        usage: result.usage,
      },
      'nl.query done'
    );

    return { ...result, toolCallsExecuted: result.toolResults.length };
  };
}

export type NlRouter = ReturnType<typeof createNlRouter>;
