import type { PluginContext } from "@voiden/sdk/ui";
import type { BlueprintScope, VoidBlueprintFile } from "./types";

export const SHARED_DIR = ".blueprints";
export const LOCAL_DIR = ".voiden/blueprints";

const DISABLED_KEY = "voiden:blueprints:disabled";

let blueprints: VoidBlueprintFile[] = [];
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export const subscribeBlueprints = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getBlueprints = () => blueprints;

const getDisabledSet = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISABLED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const saveDisabledSet = (set: Set<string>) => {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...set]));
  } catch {}
};

export const filenameToLabel = (filename: string): string =>
  filename
    .replace(/\.void$/, "")
    .replace(/^(shared|local)-/, "")
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const filenameToSlash = (filename: string): string => {
  const name = filename
    .replace(/\.void$/, "")
    .replace(/^(shared|local)-/, "")
    .replace(/^blueprint-/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `/bp-${name}`;
};

// Handles both absolute paths (/project/.blueprints/foo.void)
// and relative paths (.blueprints/foo.void or ./.blueprints/foo.void)
const matchDir = (id: string, dir: string): string | null => {
  const norm = id.replace(/\\/g, "/");
  const clean = norm.startsWith("./") ? norm.slice(2) : norm;

  // relative: dir/filename.void
  if (clean.startsWith(`${dir}/`) && clean.endsWith(".void")) {
    return clean.slice(dir.length + 1);
  }
  // absolute: .../dir/filename.void
  const marker = `/${dir}/`;
  const idx = norm.lastIndexOf(marker);
  if (idx >= 0 && norm.endsWith(".void")) {
    return norm.slice(idx + marker.length);
  }
  return null;
};

export const loadBlueprints = async (ctx: PluginContext) => {
  try {
    const files = await ctx.project.getVoidFiles();
    const disabled = getDisabledSet();
    const result: VoidBlueprintFile[] = [];

    for (const f of files) {
      let filename = matchDir(f.id, SHARED_DIR);
      let scope: BlueprintScope = "shared";

      if (!filename) {
        filename = matchDir(f.id, LOCAL_DIR);
        scope = "local";
      }

      if (!filename) continue;

      result.push({
        filename,
        label: filenameToLabel(filename),
        slash: filenameToSlash(filename),
        enabled: !disabled.has(filename),
        content: f.content,
        scope,
      });
    }

    blueprints = result.sort((a, b) => a.filename.localeCompare(b.filename));
  } catch (e) {
    console.error("[Blueprints] Failed to load", e);
    blueprints = [];
  }

  notify();
  return blueprints;
};

export const setEnabled = (filename: string, enabled: boolean) => {
  const disabled = getDisabledSet();
  if (enabled) disabled.delete(filename);
  else disabled.add(filename);
  saveDisabledSet(disabled);
  blueprints = blueprints.map((b) =>
    b.filename === filename ? { ...b, enabled } : b,
  );
  notify();
};

export const toggleScope = async (ctx: PluginContext, blueprint: VoidBlueprintFile) => {
  const newScope: BlueprintScope = blueprint.scope === "shared" ? "local" : "shared";
  const oldDir = blueprint.scope === "shared" ? SHARED_DIR : LOCAL_DIR;
  const newDir = newScope === "shared" ? SHARED_DIR : LOCAL_DIR;
  const oldPath = `${oldDir}/${blueprint.filename}`;
  const newPath = `${newDir}/${blueprint.filename}`;

  await ctx.fs.createDirectory(newDir);
  await ctx.fs.move(oldPath, newPath);

  await loadBlueprints(ctx);
};

export const deleteBlueprint = async (ctx: PluginContext, blueprint: VoidBlueprintFile) => {
  const dir = blueprint.scope === "shared" ? SHARED_DIR : LOCAL_DIR;
  const path = `${dir}/${blueprint.filename}`;
  try {
    await ctx.fs.delete(path);
  } catch (e) {
    console.error("[Blueprints] Failed to delete", e);
    throw e;
  }

  const disabled = getDisabledSet();
  disabled.delete(blueprint.filename);
  saveDisabledSet(disabled);

  await loadBlueprints(ctx);
};

export const createBlueprint = async (
  ctx: PluginContext,
  filename: string,
  content: string = "",
  scope: BlueprintScope = "shared",
) => {
  const base = filename.replace(/\.void$/, "");
  const prefixed = base.startsWith("blueprint-") ? base : `blueprint-${base}`;
  const normalised = `${prefixed}.void`;
  const dir = scope === "shared" ? SHARED_DIR : LOCAL_DIR;
  const path = `${dir}/${normalised}`;

  await ctx.fs.createDirectory(dir);
  await ctx.fs.write(path, content);
  await ctx.project.openFile(path);
  await loadBlueprints(ctx);

  return normalised;
};

export const getAllVoidFiles = async (ctx: PluginContext) => {
  try {
    const files = await ctx.project.getVoidFiles();
    return files.filter(
      (f) => !matchDir(f.id, SHARED_DIR) && !matchDir(f.id, LOCAL_DIR),
    );
  } catch {
    return [];
  }
};
