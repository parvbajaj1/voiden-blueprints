import React, { useEffect, useMemo, useState } from "react";
import type { PluginContext } from "@voiden/sdk/ui";
import type { BlueprintScope, VoidBlueprintFile } from "./types";
import {
  createBlueprint,
  deleteBlueprint,
  filenameToLabel,
  filenameToSlash,
  getAllVoidFiles,
  getBlueprints,
  loadBlueprints,
  setEnabled,
  subscribeBlueprints,
  toggleScope,
} from "./store";

type NewMode = "empty" | "from-file";

export function createBlueprintManager(
  ctx: PluginContext,
  refreshSlashGroup: () => Promise<void>,
) {
  return function BlueprintManager() {
    return <BlueprintManagerInner ctx={ctx} refreshSlashGroup={refreshSlashGroup} />;
  };
}

function ScopeTag({
  scope,
  onClick,
}: {
  scope: BlueprintScope;
  onClick: () => void;
}) {
  const isShared = scope === "shared";
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[10px] border border-border-subtle transition-colors"
      style={{
        fontSize: 10,
        padding: "2px 6px",
        borderRadius: 4,
        cursor: "pointer",
        backgroundColor: isShared ? "var(--icon-primary, #ffcc66)" : "#6b7280",
        color: "var(--ui-bg, #1a1d23)",
        border: "none",
      }}
      title={isShared ? "Shared via Git — click to make local" : "Local only — click to share via Git"}
    >
      {isShared ? "Shared" : "Local"}
    </button>
  );
}

function ScopePicker({
  value,
  onChange,
}: {
  value: BlueprintScope;
  onChange: (s: BlueprintScope) => void;
}) {
  const isShared = value === "shared";
  return (
    <div
      className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2.5 bg-editor/50"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--ui-border-subtle, #2d3344)" }}
    >
      <div className="flex flex-col" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="text-xs font-medium text-text" style={{ fontSize: 12, fontWeight: 500 }}>Visibility</span>
        <span className="text-[10px] text-comment" style={{ fontSize: 10, color: "var(--syntax-comment, #8a9199)" }}>
          {isShared ? "Shareable via Git (.blueprints/)" : "Internal only — not committed to Git"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(isShared ? "local" : "shared")}
        className="relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none"
        style={{
          position: "relative",
          display: "inline-flex",
          height: 20,
          width: 40,
          flexShrink: 0,
          cursor: "pointer",
          alignItems: "center",
          borderRadius: 9999,
          backgroundColor: isShared ? "var(--icon-primary, #ffcc66)" : "#6b7280",
          border: "none",
        }}
      >
        <span className="sr-only">Toggle visibility</span>
        <span
          className="pointer-events-none inline-block transform rounded-full transition-all duration-200 ease-in-out"
          style={{
            pointerEvents: "none",
            display: "inline-block",
            borderRadius: 9999,
            backgroundColor: "white",
            transform: isShared ? "translateX(20px)" : "translateX(3px)",
            width: 16,
            height: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }}
        />
      </button>
    </div>
  );
}

function BlueprintManagerInner({
  ctx,
  refreshSlashGroup,
}: {
  ctx: PluginContext;
  refreshSlashGroup: () => Promise<void>;
}) {
  const [blueprints, setBlueprints] = useState<VoidBlueprintFile[]>(getBlueprints());
  const [query, setQuery] = useState("");

  const [creating, setCreating] = useState(false);
  const [newMode, setNewMode] = useState<NewMode>("empty");
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<BlueprintScope>("shared");

  const [allVoidFiles, setAllVoidFiles] = useState<{ id: string; content: string }[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ id: string; content: string } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { void loadBlueprints(ctx); }, []);

  useEffect(() => {
    const unsub = subscribeBlueprints(() => setBlueprints([...getBlueprints()]));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (newMode === "from-file") {
      void getAllVoidFiles(ctx).then(setAllVoidFiles);
    }
  }, [newMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return blueprints;
    return blueprints.filter((b) =>
      `${b.label} ${b.slash} ${b.filename}`.toLowerCase().includes(q),
    );
  }, [query, blueprints]);

  const filteredVoidFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return allVoidFiles;
    return allVoidFiles.filter((f) => f.id.toLowerCase().includes(q));
  }, [fileQuery, allVoidFiles]);

  const previewSlash = useMemo(
    () => (newName.trim() ? filenameToSlash(newName.trim()) : ""),
    [newName],
  );

  const openCreate = () => {
    setCreating(true);
    setNewMode("empty");
    setNewName("");
    setNewScope("shared");
    setFileQuery("");
    setSelectedFile(null);
    setError(null);
  };

  const closeCreate = () => {
    setCreating(false);
    setNewName("");
    setNewScope("shared");
    setFileQuery("");
    setSelectedFile(null);
    setError(null);
  };

  const handleSelectFile = (file: { id: string; content: string }) => {
    const basename = file.id.replace(/\\/g, "/").split("/").pop()?.replace(/\.void$/, "") ?? "";
    setSelectedFile(file);
    setNewName(basename);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setError("Enter a file name."); return; }
    if (!/^[a-zA-Z0-9-_ ]+$/.test(name)) {
      setError("Use letters, numbers, hyphens, or underscores only.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const content = newMode === "from-file" && selectedFile ? selectedFile.content : "";
      await createBlueprint(ctx, name, content, newScope);
      await refreshSlashGroup();
      closeCreate();
    } catch {
      setError("Could not create blueprint.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (b: VoidBlueprintFile) => {
    setEnabled(b.filename, !b.enabled);
    await refreshSlashGroup();
  };

  const handleToggleScope = async (b: VoidBlueprintFile) => {
    setError(null);
    try {
      await toggleScope(ctx, b);
      await refreshSlashGroup();
    } catch {
      setError(`Could not move "${b.label}".`);
    }
  };

  const handleEdit = (b: VoidBlueprintFile) => {
    const dir = b.scope === "shared" ? ".blueprints" : ".voiden/blueprints";
    ctx.project.openFile(`${dir}/${b.filename}`);
  };

  const handleDelete = async (b: VoidBlueprintFile) => {
    setError(null);
    try {
      await deleteBlueprint(ctx, b);
      await refreshSlashGroup();
    } catch {
      setError(`Could not delete "${b.label}".`);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await loadBlueprints(ctx);
    await refreshSlashGroup();
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col bg-bg text-text overflow-hidden" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        className="border-b border-border px-4 py-3 flex items-center justify-between gap-3 shrink-0"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--ui-border-subtle, #2d3344)", flexShrink: 0 }}
      >
        <div className="text-sm font-medium" style={{ fontSize: 13, fontWeight: 500 }}>Blueprints</div>
        <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-40 px-2.5 py-1 rounded-md bg-editor text-text text-xs border border-border-subtle focus:outline-none"
            style={{ width: 140, padding: "4px 10px", borderRadius: 6, fontSize: 12, border: "1px solid var(--ui-border-subtle, #2d3344)", background: "transparent", color: "inherit", outline: "none" }}
            placeholder="Search"
          />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="px-2 py-1 rounded-md text-xs border border-border-subtle text-comment hover:text-text"
            style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, border: "1px solid var(--ui-border-subtle, #2d3344)", background: "transparent", cursor: "pointer", color: "var(--syntax-comment, #8a9199)" }}
            title="Reload blueprints"
          >
            ↻
          </button>
          {!creating && (
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-1 rounded-md text-xs"
              style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", backgroundColor: "var(--icon-primary, #ffcc66)", color: "var(--ui-bg, #1a1d23)", border: "none", fontWeight: 500 }}
            >
              New Blueprint
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-2 text-xs shrink-0 flex items-center justify-between gap-2"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 16px", fontSize: 12, flexShrink: 0, backgroundColor: "color-mix(in srgb, var(--icon-error, #f27983) 12%, transparent)", color: "var(--icon-error, #f27983)" }}
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.7, color: "inherit" }}>✕</button>
        </div>
      )}

      <div className="flex-1 overflow-auto" style={{ flex: 1, overflowY: "auto" }}>
        <div className="p-3 space-y-2" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>

          {/* ── New Blueprint form ── */}
          {creating && (
            <div
              className="rounded-md border border-border-subtle bg-surface p-4 space-y-3"
              style={{ borderRadius: 8, border: "1px solid var(--ui-border-subtle, #2d3344)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="text-xs font-medium text-text" style={{ fontSize: 12, fontWeight: 500 }}>New Blueprint</div>

              {/* Mode tabs */}
              <div
                className="flex items-center rounded border border-border-subtle overflow-hidden text-[11px] w-fit"
                style={{ display: "flex", alignItems: "center", borderRadius: 6, border: "1px solid var(--ui-border-subtle, #2d3344)", overflow: "hidden", width: "fit-content" }}
              >
                {(["empty", "from-file"] as NewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setNewMode(mode); setSelectedFile(null); setNewName(""); }}
                    className="px-3 py-1 transition-colors"
                    style={{
                      padding: "4px 12px",
                      fontSize: 11,
                      cursor: "pointer",
                      border: "none",
                      backgroundColor: newMode === mode ? "var(--icon-primary, #ffcc66)" : "transparent",
                      color: newMode === mode ? "var(--ui-bg, #1a1d23)" : "var(--syntax-comment, #8a9199)",
                    }}
                  >
                    {mode === "empty" ? "Start empty" : "Copy from file"}
                  </button>
                ))}
              </div>

              {/* ── Pick file step ── */}
              {newMode === "from-file" && !selectedFile && (
                <div className="space-y-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md bg-editor text-text text-xs border border-border-subtle focus:outline-none"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, fontSize: 12, border: "1px solid var(--ui-border-subtle, #2d3344)", background: "transparent", color: "inherit", outline: "none", boxSizing: "border-box" }}
                    placeholder="Search void files…"
                    autoFocus
                  />
                  <div
                    className="rounded-md border border-border-subtle overflow-auto"
                    style={{ borderRadius: 6, border: "1px solid var(--ui-border-subtle, #2d3344)", overflowY: "auto", maxHeight: 200 }}
                  >
                    {filteredVoidFiles.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-comment text-center" style={{ padding: "16px 12px", fontSize: 12, color: "var(--syntax-comment, #8a9199)", textAlign: "center" }}>
                        {allVoidFiles.length === 0 ? "No void files found in this project." : "No matches."}
                      </div>
                    ) : (
                      filteredVoidFiles.map((file) => {
                        const parts = file.id.replace(/\\/g, "/").split("/").filter(Boolean);
                        const cleanName = (parts[parts.length - 1] ?? file.id).replace(/\.void$/, "");
                        const dirPart = parts.length >= 2 ? parts.slice(-3, -1).join("/") : "";
                        return (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => handleSelectFile(file)}
                            className="w-full flex flex-col items-start px-3 py-2 text-left border-b border-border-subtle last:border-b-0"
                            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "8px 12px", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid var(--ui-border-subtle, #2d3344)", cursor: "pointer" }}
                          >
                            <span className="text-xs text-text" style={{ fontSize: 12, color: "inherit" }}>{cleanName}</span>
                            {dirPart && (
                              <span className="text-[10px] text-comment font-mono" style={{ fontSize: 10, color: "var(--syntax-comment, #8a9199)", fontFamily: "monospace", opacity: 0.8 }}>{dirPart}</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-end" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={closeCreate}
                      className="px-3 py-1.5 rounded-md text-sm border border-border-subtle text-comment hover:text-text"
                      style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, border: "1px solid var(--ui-border-subtle, #2d3344)", background: "transparent", cursor: "pointer", color: "var(--syntax-comment, #8a9199)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* ── Name + scope ── */}
              {(newMode === "empty" || (newMode === "from-file" && selectedFile)) && (
                <div className="space-y-3" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {newMode === "from-file" && selectedFile && (
                    <div className="text-[10px] text-comment" style={{ fontSize: 10, color: "var(--syntax-comment, #8a9199)" }}>
                      Copying from <span className="font-mono" style={{ fontFamily: "monospace" }}>{selectedFile.id}</span>
                      <button type="button" onClick={() => setSelectedFile(null)} className="ml-2 underline hover:text-text" style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", color: "inherit", padding: 0, fontSize: 10 }}>change</button>
                    </div>
                  )}
                  <label className="block" style={{ display: "block" }}>
                    <span className="block text-xs text-comment mb-1" style={{ display: "block", fontSize: 12, color: "var(--syntax-comment, #8a9199)", marginBottom: 4 }}>File name</span>
                    <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { void handleCreate(); return; }
                          if (e.key === "Backspace" && newName === "" && newMode === "from-file" && selectedFile) {
                            setSelectedFile(null);
                            setNewName("");
                          }
                        }}
                        className="flex-1 px-3 py-1.5 rounded-md bg-editor text-text text-sm border border-border-subtle focus:outline-none font-mono"
                        style={{ flex: 1, padding: "6px 12px", borderRadius: 6, fontSize: 13, border: "1px solid var(--ui-border-subtle, #2d3344)", background: "transparent", color: "inherit", outline: "none", fontFamily: "monospace" }}
                        placeholder="get-user"
                        autoFocus
                      />
                      <span className="text-xs text-comment shrink-0" style={{ fontSize: 12, color: "var(--syntax-comment, #8a9199)", flexShrink: 0 }}>.void</span>
                    </div>
                  </label>
                  {previewSlash && (
                    <div className="text-[10px] text-comment font-mono" style={{ fontSize: 10, color: "var(--syntax-comment, #8a9199)", fontFamily: "monospace" }}>
                      → <span style={{ color: "var(--icon-primary, #ffcc66)" }}>{previewSlash}</span>
                    </div>
                  )}
                  <ScopePicker value={newScope} onChange={setNewScope} />
                  <div className="text-[10px] text-comment" style={{ fontSize: 10, color: "var(--syntax-comment, #8a9199)" }}>
                    {newScope === "shared" ? "Saved to .blueprints/ — committed to Git" : "Saved to .voiden/blueprints/ — not committed to Git"}
                  </div>
                  <div className="flex justify-end gap-2 pt-1" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button
                      type="button"
                      onClick={closeCreate}
                      className="px-3 py-1.5 rounded-md text-sm border border-border-subtle text-comment hover:text-text"
                      style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, border: "1px solid var(--ui-border-subtle, #2d3344)", background: "transparent", cursor: "pointer", color: "var(--syntax-comment, #8a9199)" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-md text-sm"
                      style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", backgroundColor: "var(--icon-primary, #ffcc66)", color: "var(--ui-bg, #1a1d23)", border: "none", fontWeight: 500, opacity: loading ? 0.6 : 1 }}
                    >
                      {loading ? "Creating…" : "Create & Open"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Blueprint list ── */}
          {filtered.length === 0 && !creating ? (
            <div
              className="rounded-md border border-border-subtle bg-surface px-4 py-8 text-center text-xs text-comment"
              style={{ borderRadius: 8, border: "1px solid var(--ui-border-subtle, #2d3344)", padding: "32px 16px", textAlign: "center", fontSize: 12, color: "var(--syntax-comment, #8a9199)" }}
            >
              {blueprints.length === 0 ? (
                <>No blueprints yet. Add <code style={{ fontFamily: "monospace" }}>.void</code> files to <code style={{ fontFamily: "monospace" }}>.blueprints/</code> or click <strong>New Blueprint</strong>.</>
              ) : (
                "No blueprints match your search."
              )}
            </div>
          ) : (
            filtered.map((b) => {
              const displayFilename = b.filename.replace(/^(shared|local)-/, "");
              return (
                <div
                  key={`${b.scope}-${b.filename}`}
                  className="rounded-md border border-border-subtle bg-surface px-3 py-2.5"
                  style={{ borderRadius: 8, border: "1px solid var(--ui-border-subtle, #2d3344)", padding: "8px 12px" }}
                >
                  <div
                    className="flex items-center justify-between gap-2"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                  >
                    {/* left: label + slash */}
                    <div className="min-w-0" style={{ minWidth: 0, flex: 1 }}>
                      <div className="flex items-center gap-1.5" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          className={`text-sm truncate${!b.enabled ? " opacity-40" : ""}`}
                          style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: b.enabled ? 1 : 0.4 }}
                        >
                          {b.label}
                        </span>
                        {!b.enabled && (
                          <span
                            className="text-[10px] uppercase rounded border border-border-subtle px-1.5 py-0.5 text-comment shrink-0"
                            style={{ fontSize: 10, flexShrink: 0, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--ui-border-subtle, #2d3344)", color: "var(--syntax-comment, #8a9199)" }}
                          >
                            Off
                          </span>
                        )}
                      </div>
                      <div
                        className="text-[10px] text-comment font-mono mt-0.5 flex items-center gap-2"
                        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "monospace", color: "var(--syntax-comment, #8a9199)", marginTop: 2 }}
                      >
                        <span style={{ color: "var(--icon-primary, #ffcc66)" }}>{b.slash}</span>
                        <span className="opacity-40" style={{ opacity: 0.4 }}>·</span>
                        <span className="opacity-60 truncate" style={{ opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayFilename}</span>
                      </div>
                    </div>

                    {/* right: action buttons */}
                    <div
                      className="flex items-center gap-1 shrink-0"
                      style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                    >
                      <ScopeTag scope={b.scope} onClick={() => void handleToggleScope(b)} />
                      <button
                        type="button"
                        onClick={() => void handleToggleEnabled(b)}
                        className="px-1.5 py-0.5 rounded text-[10px] border border-border-subtle text-comment hover:text-text"
                        style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "transparent", cursor: "pointer", color: "var(--syntax-comment, #8a9199)", border: "1px solid var(--ui-border-subtle, #2d3344)" }}
                      >
                        {b.enabled ? "On" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(b)}
                        className="px-1.5 py-0.5 rounded text-[10px] border border-border-subtle text-comment hover:text-text"
                        style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "transparent", cursor: "pointer", color: "var(--syntax-comment, #8a9199)", border: "1px solid var(--ui-border-subtle, #2d3344)" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(b)}
                        className="px-1.5 py-0.5 rounded text-[10px] border border-border-subtle"
                        style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "transparent", cursor: "pointer", color: "var(--icon-error, #f27983)", border: "1px solid var(--ui-border-subtle, #2d3344)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
