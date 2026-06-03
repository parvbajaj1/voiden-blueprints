import { Extension } from "@tiptap/core";
import type { PluginContext } from "@voiden/sdk/ui";
import { loadBlueprints, getBlueprints, subscribeBlueprints } from "./store";
import { createBlueprintSlashGroup } from "./slashGroup";
import { createBlueprintManager } from "./Manager";

const PLUGIN_ID = "voiden-blueprints";
const TAB_ID = "blueprints-manager-tab";
const WATCHER_NAME = "voiden-blueprints-watcher";

let context: PluginContext;
let unsubscribe: (() => void) | null = null;
let managerComponent: (() => JSX.Element) | null = null;
let cachedTabId: string | null = null;
let watcherTimer: ReturnType<typeof setTimeout> | null = null;

const createBlueprintWatcher = (onEdit: () => Promise<void>) =>
  Extension.create({
    name: WATCHER_NAME,
    onUpdate() {
      if (watcherTimer) clearTimeout(watcherTimer);
      watcherTimer = setTimeout(() => {
        watcherTimer = null;
        void onEdit();
      }, 1500);
    },
    onDestroy() {
      if (watcherTimer) { clearTimeout(watcherTimer); watcherTimer = null; }
    },
  });

const refreshSlashGroup = async () => {
  const blueprints = getBlueprints();
  const groupData = createBlueprintSlashGroup(context, blueprints);
  const allGroups = context.getVoidenSlashGroups();
  const existing = allGroups.find((g) => g.name === "blueprints");

  if (existing) {
    existing.commands = groupData.commands;
    existing.title = groupData.title;
  } else {
    context.addVoidenSlashGroup(groupData);
  }
};

export default (ctx: PluginContext) => ({
  onload: async () => {
    context = ctx;

    await loadBlueprints(ctx);
    await refreshSlashGroup();

    unsubscribe = subscribeBlueprints(() => {
      void refreshSlashGroup();
    });

    ctx.registerVoidenExtension(
      createBlueprintWatcher(async () => {
        const tab = await (ctx as any).tab?.getActiveTab?.();
        const title: string = tab?.title ?? "";
        if (!title.startsWith("blueprint-") || !title.endsWith(".void")) return;
        await loadBlueprints(ctx);
        await refreshSlashGroup();
      }),
    );

    managerComponent = createBlueprintManager(ctx, refreshSlashGroup);

    (ctx as any).registerStatusBarItem({
      id: PLUGIN_ID,
      icon: "Blocks",
      label: "Blueprints",
      tooltip: "Open Blueprints Manager",
      position: "left",
      onClick: async () => {
        if (!managerComponent) return;
        if (cachedTabId) {
          try {
            await (window as any).electron?.tab?.activate("main", cachedTabId);
            return;
          } catch {
            cachedTabId = null;
          }
        }
        cachedTabId = TAB_ID;
        await (ctx as any).addTab("main", {
          id: TAB_ID,
          icon: "Blocks",
          title: "Blueprints",
          props: {},
          component: managerComponent,
        });
      },
    });
  },

  onunload: () => {
    unsubscribe?.();
    unsubscribe = null;
    managerComponent = null;
    cachedTabId = null;
    if (watcherTimer) { clearTimeout(watcherTimer); watcherTimer = null; }
    ctx.unregisterVoidenExtension(WATCHER_NAME);
  },
});
