# Connecting Claude Desktop to DirectorAI

## Step 1: Build the server

```powershell
cd "D:\CODE AI\PREMIRE"
pnpm --filter @directorai/server build
```

## Step 2: Configure Claude Desktop

Open `%APPDATA%\Claude\claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "directorai": {
      "command": "node",
      "args": ["D:\\CODE AI\\PREMIRE\\apps\\server\\dist\\index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-YOUR-KEY-HERE",
        "LOG_LEVEL": "info",
        "NODE_ENV": "production"
      }
    }
  }
}
```

> **Note**: Replace `sk-ant-YOUR-KEY-HERE` with your actual Anthropic API key.
> The key is needed for vision analysis (P2) and LLM routing. Tools work without it.

## Step 3: Restart Claude Desktop

Close and reopen Claude Desktop. You should see **"DirectorAI"** in the MCP tools list (🔧 icon).

## Step 4: Test

In Claude Desktop, try:

```
Get the active Premiere project info
```

```
List all sequences in the project
```

```
Import the file C:\Footage\hero.mp4 into the timeline
```

```
Cut the first clip at 5 seconds
```

## What tools Claude has access to

| Group           | Tools                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Project**     | `project_get`, `project_listSequences`, `project_setActiveSequence`, `project_getActiveSequence`                              |
| **Timeline**    | `timeline_listClips`, `timeline_getClip`, `timeline_cutClip`, `timeline_trimClip`, `timeline_moveClip`, `timeline_deleteClip` |
| **Effects**     | `effect_apply`, `effect_remove`                                                                                               |
| **Color**       | `color_applyPreset`, `color_setParams`                                                                                        |
| **Audio**       | `audio_setGain`, `audio_addFade`, `audio_muteTrack`                                                                           |
| **Text**        | `text_addOverlay`                                                                                                             |
| **Transitions** | `transition_apply`, `transition_list`                                                                                         |
| **Markers**     | `marker_add`, `marker_list`, `marker_delete`                                                                                  |
| **Media**       | `media_import`                                                                                                                |
| **Export**      | `export_sequence`                                                                                                             |
| **Tracks**      | `tracks_list`                                                                                                                 |
| **Keyframes**   | `keyframe_add`                                                                                                                |
| **Undo**        | `undo_begin`, `undo_end`                                                                                                      |

Total: **29 tools** across 13 groups.

## Troubleshooting

| Issue                             | Fix                                                             |
| --------------------------------- | --------------------------------------------------------------- |
| Tools not shown in Claude         | Restart Claude Desktop, check JSON is valid                     |
| `Cannot find module` error        | Run `pnpm --filter @directorai/server build`                    |
| Tools work but no Premiere effect | Server uses MockAdapter by default — need UXP panel in Premiere |
| Panel shows "Disconnected"        | Start server first: `.\tools\start-server.ps1`                  |

## Architecture when fully connected

```
You type in Claude Desktop
       │
       ▼
Claude (claude-opus-4-7) thinks...
       │ MCP tool call
       ▼
DirectorAI MCP Server (Node.js :7777)
       │ JSON-RPC
       ▼
DirectorAI UXP Panel (inside Premiere)
       │ require('premierepro')
       ▼
Adobe Premiere Pro 2024 timeline
```
