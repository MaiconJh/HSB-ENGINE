import { useState } from "react";

type CommandPanelProps = {
  onCommand: (cmd: string, payload: unknown) => void;
  loading: string | null;
};

export const CommandPanel = ({ onCommand, loading }: CommandPanelProps) => {
  const [eventsLimit, setEventsLimit] = useState(50);
  const [diagnosticsLimit, setDiagnosticsLimit] = useState(50);
  const [scanDir, setScanDir] = useState("./modules");

  return (
    <section className="panel command-panel">
      <h2>Actions</h2>
      <div className="command-panel__group">
        <button
          type="button"
          disabled={loading === "kernel.snapshot.get"}
          onClick={() => onCommand("kernel.snapshot.get", {})}
        >
          {loading === "kernel.snapshot.get" ? "Loading..." : "Get Snapshot"}
        </button>
      </div>
      <div className="command-panel__group">
        <label htmlFor="events-limit">Tail Events (N)</label>
        <input
          id="events-limit"
          type="number"
          min={1}
          max={200}
          value={eventsLimit}
          onChange={(event) => setEventsLimit(Number(event.target.value))}
        />
        <button
          type="button"
          disabled={loading === "kernel.events.tail"}
          onClick={() => onCommand("kernel.events.tail", { limit: eventsLimit })}
        >
          {loading === "kernel.events.tail" ? "Loading..." : "Tail Events"}
        </button>
      </div>
      <div className="command-panel__group">
        <label htmlFor="diagnostics-limit">Tail Diagnostics (N)</label>
        <input
          id="diagnostics-limit"
          type="number"
          min={1}
          max={200}
          value={diagnosticsLimit}
          onChange={(event) => setDiagnosticsLimit(Number(event.target.value))}
        />
        <button
          type="button"
          disabled={loading === "kernel.diagnostics.tail"}
          onClick={() => onCommand("kernel.diagnostics.tail", { limit: diagnosticsLimit })}
        >
          {loading === "kernel.diagnostics.tail" ? "Loading..." : "Tail Diagnostics"}
        </button>
      </div>
      <div className="command-panel__group">
        <label htmlFor="scan-dir">Scan Modules (Host)</label>
        <input
          id="scan-dir"
          type="text"
          value={scanDir}
          onChange={(event) => setScanDir(event.target.value)}
        />
        <button
          type="button"
          disabled={loading === "host.modules.scan"}
          onClick={() => onCommand("host.modules.scan", { baseDir: scanDir })}
        >
          {loading === "host.modules.scan" ? "Loading..." : "Scan Modules (Host)"}
        </button>
      </div>
    </section>
  );
};
