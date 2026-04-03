import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "uos-tool-trawl-web-extraction",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Trawl Web Extraction",
  description: "uos-tool-trawl-web-extraction plugin",
  author: "turmo.dev",
  categories: ["automation"],
  capabilities: [
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write"
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "health-widget",
        displayName: "Trawl Web Extraction Health",
        exportName: "DashboardWidget"
      }
    ]
  }
};

export default manifest;
