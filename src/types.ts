export type BlueprintScope = "shared" | "local";

export type VoidBlueprintFile = {
  filename: string;
  label: string;
  slash: string;
  enabled: boolean;
  content: string;
  scope: BlueprintScope;
};
