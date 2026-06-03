import { TextSelection } from "@tiptap/pm/state";
import type { PluginContext } from "@voiden/sdk/ui";
import type { VoidBlueprintFile } from "./types";
import { loadBlueprints, getBlueprints } from "./store";

const SINGLETON_CONFLICTS: Record<string, string[]> = {
  "request":         ["request", "endpoint", "socket-request"],
  "endpoint":        ["request", "endpoint", "socket-request"],
  "socket-request":  ["request", "endpoint", "socket-request"],
  "headers-table":   ["headers-table"],
  "query-table":     ["query-table"],
  "multipart-table": ["multipart-table"],
  "url-table":       ["url-table"],
  "cookies-table":   ["cookies-table"],
  "options-table":   ["options-table"],
  "json_body":       ["json_body"],
  "xml_body":        ["xml_body"],
  "yml_body":        ["yml_body"],
  "path-table":      ["path-table"],
};

// Returns the union of all conflict groups for singleton nodes in the blueprint
// (only nodes before the first request-separator — those go into the current section).
const computeCompareKeys = (blueprintNodes: any[]): string[] => {
  const keys = new Set<string>();
  for (const node of blueprintNodes) {
    if (node.type === "request-separator") break;
    const conflicts = SINGLETON_CONFLICTS[node.type];
    if (conflicts) conflicts.forEach((k) => keys.add(k));
  }
  return [...keys];
};

const flushNodesAtSelection = (editor: any, nodeJsons: any[]): void => {
  if (nodeJsons.length === 0) return;
  const { state, view } = editor;
  const blocks = nodeJsons.map((n) => state.schema.nodeFromJSON(n));
  const paragraph = state.schema.nodes.paragraph.create();
  const { $from } = state.selection;
  const topLevelStart = $from.depth > 0 ? $from.before(1) : 0;
  const topLevelNode = state.doc.nodeAt(topLevelStart);
  const replaceFrom =
    topLevelNode?.type.name === "paragraph"
      ? topLevelStart
      : Math.min(topLevelStart + (topLevelNode?.nodeSize ?? 0), state.doc.content.size);
  const replaceTo =
    topLevelNode?.type.name === "paragraph"
      ? topLevelStart + topLevelNode.nodeSize
      : replaceFrom;
  const tr = state.tr.replaceWith(replaceFrom, replaceTo, [...blocks, paragraph]);
  const cursorPos = replaceFrom + blocks.reduce((pos, node) => pos + node.nodeSize, 0) + 1;
  tr.setSelection(TextSelection.create(tr.doc, cursorPos)).scrollIntoView();
  view.dispatch(tr);
};

export const createBlueprintSlashGroup = (
  ctx: PluginContext,
  blueprints: VoidBlueprintFile[],
) => ({
  name: "blueprints",
  title: "Blueprints",
  commands: blueprints
    .filter((b) => b.enabled)
    .map((b) => {
      let compareKeys: string[] = [];
      try {
        const doc = ctx.helpers.parseVoid(b.content);
        const nodes = (doc.content ?? []) as any[];
        compareKeys = computeCompareKeys(nodes);
      } catch {}

      return {
        name: b.slash.slice(1),
        label: b.label,
        description: b.slash,
        slash: b.slash,
        ...(compareKeys.length > 0 ? { singleton: true, compareKeys } : {}),
        action: async (editor: any) => {
          try {
            await loadBlueprints(ctx);
            const fresh = getBlueprints().find(
              (bp) => bp.filename === b.filename && bp.scope === b.scope,
            );
            const content = fresh?.content ?? b.content;
            if (!content.trim()) return;

            const doc = ctx.helpers.parseVoid(content);
            const nodes = (doc.content ?? []) as any[];
            if (nodes.length === 0) return;

            editor.commands.focus();
            flushNodesAtSelection(editor, nodes);
          } catch (e) {
            console.error(`[Blueprints] Failed to insert "${b.label}"`, e);
          }
        },
      };
    }),
});
