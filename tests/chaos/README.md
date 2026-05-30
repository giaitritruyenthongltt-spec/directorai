# Chaos tests (P4.08)

Three failure scenarios validate the reliability guarantees from P4.05–P4.07:

| Scenario                 | What we kill                            | Expected behaviour                                                                                               |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `panel-drop.test.ts`     | panel WebSocket forcibly closed mid-RPC | server fall-back to mock adapter, in-flight call returns or yields a clean error; no leaked pending entries      |
| `server-restart.test.ts` | server process closed under the panel   | panel's `ReconnectMachine` schedules a reconnect with exponential backoff, succeeds on relaunch                  |
| `context-down.test.ts`   | context-engine bridge unreachable       | `context.*` calls fail with a CLEAR `METHOD_NOT_FOUND`-style error, other RPCs (Premiere tools) continue working |

All three run against the real WS server bound to a free port; nothing
in this suite requires an actual Adobe UXP or Python environment.

Run them with:

```
pnpm test
# or just the chaos subset
pnpm vitest run tests/chaos
```
