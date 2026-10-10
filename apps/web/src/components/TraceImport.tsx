import { parseTrace, type SimConfig } from "@cache-lab/sim-core";
import { useState } from "react";
import { isTraceWorkload, withTrace } from "../lib/configEdit";

const MAX_BYTES = 400_000;
const EXAMPLE = "# one request per line: [GET|PUT] key\nGET user:1\nGET user:2\nGET user:1\nPUT user:1\nGET user:3\nGET user:1";

export function TraceImport({ config, onChange }: { config: SimConfig; onChange(c: SimConfig): void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const active = isTraceWorkload(config);

  const apply = (raw: string) => {
    if (raw.length > MAX_BYTES) return setMsg(`Trace too large (max ${Math.round(MAX_BYTES / 1000)} KB).`);
    const t = parseTrace(raw);
    if (t.keys.length === 0) return setMsg("No requests found. Use one `key` or `GET key` per line.");
    onChange(withTrace(config, t.keys, t.ops, t.keyspace));
    setMsg(`Replaying ${t.keys.length} requests over ${t.keyspace} keys (loops when it ends). Keys starting with “x” are treated as nonexistent.`);
  };

  return (
    <details className="trace-import" open={active}>
      <summary>{active ? "Replaying a trace" : "Replay a trace"}</summary>
      <label className="field">
        <span>Paste requests</span>
        <textarea rows={5} value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <div className="btn-row">
        <button onClick={() => apply(text)} disabled={!text.trim()}>Use pasted trace</button>
        <label className="file-btn">
          Upload file
          <input
            type="file"
            accept=".txt,.csv,.log,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) apply(await f.text());
              e.target.value = "";
            }}
          />
        </label>
        <button onClick={() => setText(EXAMPLE)}>Example</button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}
    </details>
  );
}
