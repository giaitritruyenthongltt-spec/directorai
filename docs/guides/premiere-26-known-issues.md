# Premiere Pro 2026 v26 — Known UXP Issues

> Issues discovered during live operational testing on
> `E:\T11\PHONG DEP TRUY_6_1.prproj` (413-clip project, sequence "tap 11").
> These affect what DirectorAI can actually do on Premiere 26 today.

---

## ✅ What works (live verified 2026-06-01)

### Read operations

- `project.getActiveSequence` → returns sequence guid + name correctly
- `timeline.listClips` → returns all 413 clips with synthetic IDs
  (`video-0:0:0530.mp4`) since Premiere 26 leaves `nodeId` undefined.
  V2 clipCache makes subsequent lookups O(1).
- `tracks.list`, `project.get`, etc. — fast (< 1s after first call)

### Director plan generation

- Gemini → JSON-RPC → validated Plan in 30-60s
- Plan stores in `~/.directorai/plan-history.json` (F2 verified: count
  grew 2 → 6 across smoke runs)
- `director.execute` reaches step 1 successfully against the real
  panel adapter

### Build / distribution

- TS workspace builds clean: 464 tests, 38 packages
- Python sidecar: 88 tests
- CCX bundle valid: 260.7 KB, 11/11 shape checks

---

## 🔴 What hangs (live observed)

### `Component.create('AE.ADBE Lumetri')` — 90s+ timeout

**Symptom**: server-side `panelCall('effect.apply', ...)` and
`panelCall('color.applyPreset', ...)` both time out > 90s.

**Diagnostic logs added** (D1, V2.3.1):

```typescript
log('enter');
log('mutate lockedAccess opened');
log('findTrackItem ok');        ← gets this far (< 1s)
log('getComponentChain ok');    ← gets this far
log('Component.create ok');     ← NEVER REACHED — hangs here
log('insertComponent ok');
log('translateComponent ok');
```

**Hypothesis**: Premiere 26's UXP Component factory has a regression
where `Component.create()` doesn't resolve for `AE.ADBE Lumetri`. The
operation may complete internally but the Promise never settles.

**Reports**: similar issue reported on Adobe UXP forums for
Premiere 26.0.0. May be fixed in 26.1.

**Mitigations not yet tried**:

- Use `chain.insertEffect(matchName)` if that API exists in 26
- Probe via component template instead of matchName
- Use Effect Controls panel "preset drop" via different API surface

**Status**: BLOCKING for color grade workflow. Workaround: user
applies Lumetri manually, DirectorAI sets parameters via
`setColorParams` (uses param-level API which works).

---

## 🔴 `applyTransition` — "no compatible API found"

**Symptom**:

```
[UXP] applyTransition: no compatible API found for
"AE.ADBE Cross Dissolve" between video-0:0:0530.mp4/video-0:7212...
Tried TransitionFactory + track.addTransition probes.
```

**Diagnostic**: adapter probes 2 paths:

1. `ppro.TransitionFactory.createVideoTransition` → not present in 26
2. `track.addTransition(matchName, time, duration)` → not present in 26

**Hypothesis**: Premiere 26 removed both documented transition entry
points. Adobe may have moved to a new API (e.g.
`transition.addToClipBoundary`) that wasn't in the 24/25 docs.

**Mitigations not yet tried**:

- Inspect `ppro` global at runtime to find available transition verbs
- Try `Sequence.addTransition` or `Clip.addOutTransition` if they exist

**Status**: BLOCKING for transition workflow. Workaround: skip
transitions in autogen plans (Plan A/B in operational-test-plan.md
work without them).

---

## ⚠ `nodeId` undefined for some TrackItems

**Symptom**: live observed — `it.nodeId` returns `undefined` for ALL
clips in the user's project on Premiere 26.

**Mitigation (P0-4 + V2)**: synthetic ID
`${trackKind}-${trackIndex}:${startTick}:${name}` used as fallback.
`findTrackItem` walks + indexes once into `clipCache` Map.

**Status**: WORKING. Adapter transparently uses synthetic IDs.

---

## 📊 Real-job workflow status

| Workflow                                   | Status         | Why                                                                                                                                                                  |
| ------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan A — Cut silence (delete clips)        | 🟡 partial     | Plan generates; execute reaches step 1; subsequent steps depend on `timeline.deleteClip` which uses `findTrackItem` → cache helps but real delete operation untested |
| Plan B — Apply Lumetri preset to clips     | ❌ blocked     | Component.create hangs                                                                                                                                               |
| Plan C — Beat-cut montage (cuts + Lumetri) | 🟡 partial     | Cuts work via `cutClip`; Lumetri grade step would hang                                                                                                               |
| Plan D — Pure cut/trim/delete (no effects) | ✅ should work | All-read + cutClip primitives verified                                                                                                                               |

---

## 🎯 Recommended Premiere 26 plan template

For real-job use TODAY, restrict plans to:

- `project.getActiveSequence`
- `timeline.listClips`
- `context.scanClips` / `scoreQuality` / `detectBeats` / `analyzeColor`
- `timeline.cutClip`
- `timeline.trimClip`
- `timeline.moveClip`
- `timeline.deleteClip`
- `marker.add` / `listMarkers`
- `color.setParams` (writes Lumetri params if Lumetri exists; user
  applies Lumetri manually first)
- `audio.setGain` / `audio.addFade`
- `text.addOverlay`

Avoid:

- `effect.apply` (Component.create hang)
- `color.applyPreset` (calls effect.apply under the hood)
- `transition.apply` (API removed)
- `color.applyLookByScene` (calls applyColorPreset N times)

---

## Next investigation steps

1. **Open UDT DevTools** during effect.apply call — verify the D1
   diagnostic logs show exactly where the hang is.
2. **Try Premiere 26.1 beta** when available — Adobe may have fixed
   Component factory.
3. **Inspect `ppro` runtime** — list all available APIs to find new
   transition entry point.
4. **Bypass Component.create** — try copying an existing Lumetri
   component from a "donor" clip via `chain.cloneComponent` if
   present.
