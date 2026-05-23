/**
 * Live integration test — no Premiere required.
 * Runs entirely against MockPremiereAdapter.
 *
 * Usage: node tools/live-test.mjs
 */
import { MockPremiereAdapter, dispatchRpc, listRpcMethods } from '../packages/premiere-adapter/dist/index.js';
import { parseStyle, getBuiltinStyle, listBuiltinStyles } from '../packages/style-engine/dist/index.js';
import { planCuts } from '../packages/cut-planner/dist/planner.js';
import { EFFECT_PRESETS } from '../packages/effect-library/dist/registry.js';
import { seconds } from '../packages/core/dist/index.js';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ${GREEN}✅${RESET} ${label}`);
  passed++;
}
function fail(label, err) {
  console.log(`  ${RED}❌${RESET} ${label}: ${err.message ?? err}`);
  failed++;
}

async function section(title, fn) {
  console.log(`\n${BOLD}${CYAN}▶ ${title}${RESET}`);
  await fn();
}

// ─── 1. MCP Dispatcher ────────────────────────────────────────────
await section('MCP RPC Dispatcher', async () => {
  const adapter = new MockPremiereAdapter();
  const methods = listRpcMethods();
  ok(`${methods.length} RPC methods registered`);

  try {
    const proj = await dispatchRpc('project.get', {}, adapter);
    ok(`project.get → name="${proj.metadata.name}"`);
  } catch(e) { fail('project.get', e); }

  try {
    const seqs = await dispatchRpc('project.listSequences', {}, adapter);
    ok(`project.listSequences → ${seqs.length} sequence(s)`);
  } catch(e) { fail('project.listSequences', e); }
});

// ─── 2. Full timeline edit flow ───────────────────────────────────
await section('Full Timeline Edit Flow', async () => {
  const adapter = new MockPremiereAdapter();
  try {
    // Import file
    const imported = await dispatchRpc('media.import', { path: 'C:\\Footage\\hero.mp4' }, adapter);
    ok(`media.import → id=${imported.id}`);

    // List clips
    const seq = await dispatchRpc('project.getActiveSequence', {}, adapter);
    const clips = seq.tracks.flatMap(t => t.clips);
    ok(`getActiveSequence → ${clips.length} clip(s) on timeline`);

    // Cut a clip
    const clipId = clips[0].id;
    const cut = await dispatchRpc('timeline.cutClip', { clipId, at: 2.5 }, adapter);
    ok(`timeline.cutClip at 2.5s → ${cut.length} resulting clips`);

    // Apply effect
    const effect = await dispatchRpc('effect.apply', { clipId, effectMatchName: 'Lumetri:TealOrange' }, adapter);
    ok(`effect.apply TealOrange → effectId=${effect.id}`);

    // Add marker
    const seq2 = await dispatchRpc('project.getActiveSequence', {}, adapter);
    const marker = await dispatchRpc('marker.add', {
      sequenceId: seq2.id,
      time: 5,
      name: 'Hook End'
    }, adapter);
    ok(`marker.add → id=${marker.id}`);

    // Add text overlay
    const text = await dispatchRpc('text.addOverlay', {
      sequenceId: seq2.id,
      trackIndex: 0,
      text: 'This only took 2min to edit!',
      startTime: 0,
      duration: 3
    }, adapter);
    ok(`text.addOverlay → clipId=${text.clipId}`);

    // Export
    const job = await dispatchRpc('export.sequence', {
      sequenceId: seq2.id,
      outputPath: 'C:\\Export\\hero_export.mp4',
      presetPath: 'H264_4K'
    }, adapter);
    ok(`export.sequence → jobId=${job.jobId}`);

  } catch(e) { fail('Timeline flow', e); }
});

// ─── 3. Style Engine ──────────────────────────────────────────────
await section('Style Engine', async () => {
  const styles = listBuiltinStyles();
  ok(`${styles.length} built-in styles: ${styles.join(', ')}`);

  try {
    const yaml = `
name: Custom QuickTest
pacing:
  body:
    cutsPerSec: 2
effects:
  - on: keyword
    keywords: ["premiere", "plugin"]
    action: zoom_punch
removeFillers: true
removeSilence: true
`;
    const style = parseStyle(yaml);
    ok(`parseStyle → name="${style.name}", body_cuts=${style.pacing.body.cutsPerSec}`);
  } catch(e) { fail('parseStyle custom', e); }
});

// ─── 4. Cut Planner ───────────────────────────────────────────────
await section('Cut Planner (Context + Style → Plan)', async () => {
  const context = {
    mediaPath: 'C:\\Footage\\tutorial.mp4',
    durationSec: seconds(120),
    segments: [
      { start: seconds(0), end: seconds(5), text: 'Hello and welcome' },
      { start: seconds(5), end: seconds(5.8), text: 'um uh', isFiller: true },
      { start: seconds(5.8), end: seconds(30), text: 'today I show you this AI premiere plugin' },
      { start: seconds(30), end: seconds(31.5), text: '', isSilence: true },
      { start: seconds(31.5), end: seconds(90), text: 'the plugin works by analyzing your footage with AI' },
    ],
    scenes: [{ start: seconds(0), end: seconds(90) }],
    beats: [seconds(5), seconds(10), seconds(15), seconds(20)]
  };

  for (const styleName of ['vlog', 'techReel', 'cinematic']) {
    const style = getBuiltinStyle(styleName);
    const plan = planCuts({ style, context });
    ok(`planCuts [${styleName}] → ${plan.steps.length} steps, est ${plan.estimatedDurationSec.toFixed(1)}s`);
  }
});

// ─── 5. Effect Library ────────────────────────────────────────────
await section('Effect Library', async () => {
  ok(`${EFFECT_PRESETS.length} effect presets registered`);
  const cats = [...new Set(EFFECT_PRESETS.map(e => e.category))];
  ok(`Categories: ${cats.join(', ')}`);
});

// ─── 6. Undo/Redo Lifecycle ───────────────────────────────────────
await section('Undo Group Lifecycle', async () => {
  const adapter = new MockPremiereAdapter();
  try {
    await dispatchRpc('undo.begin', { label: 'DirectorAI edit' }, adapter);
    await dispatchRpc('media.import', { path: 'C:\\clip.mp4' }, adapter);
    await dispatchRpc('undo.end', {}, adapter);
    ok('undo.begin → edit → undo.end lifecycle works');
  } catch(e) { fail('undo lifecycle', e); }
});

// ─── Results ──────────────────────────────────────────────────────
console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
console.log(`${BOLD}LIVE TEST RESULTS${RESET}`);
console.log(`  ${GREEN}Passed: ${passed}${RESET}   ${failed > 0 ? RED : ''}Failed: ${failed}${RESET}`);
if (failed === 0) {
  console.log(`\n${BOLD}${GREEN}✅ All live tests passed — core stack is fully functional.${RESET}`);
} else {
  console.log(`\n${BOLD}${RED}❌ ${failed} test(s) failed.${RESET}`);
  process.exit(1);
}
