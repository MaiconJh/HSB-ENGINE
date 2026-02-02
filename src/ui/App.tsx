import { useMemo, useState } from "react";
import { CommandPanel } from "./components/CommandPanel.tsx";
import { JsonPanel } from "./components/JsonPanel.tsx";
import { createUiTransport } from "./transport.ts";

type Status = { label: string; code?: string };

export const App = () => {
  const transport = useMemo(() => createUiTransport(), []);
  const [response, setResponse] = useState<unknown>(null);
  const [status, setStatus] = useState<Status>({ label: "IDLE" });
  const [loading, setLoading] = useState<string | null>(null);

  const runCommand = async (cmd: string, payload: unknown) => {
    setLoading(cmd);
    try {
      const result = await transport.request(cmd, payload, { source: "kernel" });
      setResponse(result);
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        (result as { ok?: boolean }).ok === false
      ) {
        const code = (result as { error?: { code?: string } }).error?.code;
        setStatus({ label: "ERROR", code });
      } else {
        setStatus({ label: "OK" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorResponse = {
        ok: false,
        error: { code: "TRANSPORT_ERROR", message },
      };
      setResponse(errorResponse);
      setStatus({ label: "ERROR", code: "TRANSPORT_ERROR" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="station">
      <header className="station__header">
        <h1>Station 0</h1>
        <p>UnifiedKernelTransport Console</p>
      </header>
      <div className="station__body">
        <CommandPanel onCommand={runCommand} loading={loading} />
        <section className="panel output-panel">
          <div className="output-panel__status">
            <span>Status:</span>
            <strong>
              {status.label}
              {status.code ? ` (${status.code})` : ""}
            </strong>
          </div>
          <JsonPanel value={response} />
        </section>
      </div>
    </div>
  );
};
