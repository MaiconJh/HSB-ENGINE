# Tauri IPC Contract (Draft)

## Invoke command
Use the `hsb_ipc` invoke command with a single payload key:

```json
{
  "request": {
    "id": "string",
    "cmd": "kernel.snapshot.get",
    "payload": {},
    "meta": { "source": "kernel" }
  }
}
```

## Request shape (IpcRequest)

```ts
type IpcRequest = {
  id: string;
  cmd: string;
  payload: unknown;
  meta: { source: string };
};
```

## Response shape (IpcResponse)

```ts
type IpcResponse = {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};
```

## Notes
- The kernel currently runs in TypeScript; the Rust side should act as a dispatcher/proxy to the KernelBridge.
- All payloads and responses must be JSON-safe.
