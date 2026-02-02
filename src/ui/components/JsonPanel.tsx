import { useMemo, useState } from "react";

type JsonPanelProps = {
  value: unknown;
};

export const JsonPanel = ({ value }: JsonPanelProps) => {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const jsonText = useMemo(() => {
    if (value === null || value === undefined) {
      return "No response yet.";
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return `Unable to render JSON: ${error instanceof Error ? error.message : String(error)}`;
    }
  }, [value]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopyStatus("Copied");
      setTimeout(() => setCopyStatus(null), 1500);
    } catch (error) {
      setCopyStatus("Copy failed");
      setTimeout(() => setCopyStatus(null), 1500);
    }
  };

  return (
    <div className="json-panel">
      <div className="json-panel__actions">
        <button type="button" onClick={handleCopy}>
          Copy JSON
        </button>
        {copyStatus ? <span className="json-panel__status">{copyStatus}</span> : null}
      </div>
      <pre>{jsonText}</pre>
    </div>
  );
};
