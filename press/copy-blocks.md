# Pre-written copy blocks

Drop in as-is or paraphrase. No permission needed.

## 50 words

DirectorAI is an AI editing copilot that lives inside Adobe Premiere
Pro 2024+. It transcribes, scene-detects, and beat-aligns your
footage locally, then produces rough cuts in a single click —
learning your editing style as you correct it.

## 100 words

DirectorAI is an AI editing copilot for Adobe Premiere Pro. Unlike
generic auto-edit tools, it runs entirely on your machine (Whisper
for transcribe, PySceneDetect for scenes, librosa for beats, Claude
Vision for shot description) and produces rough cuts inside one undo
group — single Ctrl-Z reverts the whole apply. The Style Engine
watches the diff between its plan and your manual tweaks and
reproduces your style next run. Out of the box: vlog, talking-head,
podcast, tech-reel, cinematic. With a Pro license: custom YAML
styles and a learner that tunes them over time.

## 250 words

Most "AI editor" tools today do one thing — trim silences in
talking-head footage. DirectorAI tackles the whole cut.

Inside Adobe Premiere Pro 2024+, the DirectorAI panel sees your
active sequence and brings four local pipelines to bear on it:
Whisper transcribes the audio, PySceneDetect cuts on shot
boundaries, librosa picks out beats, and Claude Vision captions
each shot. The deterministic Cut Planner then turns a style
(YAML file or built-in preset) plus that context into a Plan — a
list of tool calls. You can dry-run, diff, share, or run it
straight away.

When the LLM refiner is enabled (just paste your Anthropic API
key), Claude takes one pass over the rule-based plan to reorder,
drop, or add steps. Without a key, the rule planner is enough.
Every apply runs inside one Premiere undo group, so a single
Ctrl-Z reverts everything.

The Style Engine is the moat. After two matching manual
corrections, the learner derives a StylePatch — applied next run,
with your approval, never silently. Vlog, talking-head, podcast,
cinematic, tech-reel ship out of the box. Pro license unlocks
custom YAML styles, .style import/export, and the learner.

DirectorAI runs Windows-first (Premiere Pro 2024+), with macOS DMG
on the post-launch roadmap. Pricing: Basic $9.99 one-time, Pro
$109 one-time, Subscription $19/mo for the upcoming style
marketplace.

press@directorai.app · directorai.app
