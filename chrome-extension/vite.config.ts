import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function manifestPlugin(oauthClientId: string): Plugin {
  return {
    name: "ai-link-archive-extension-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(
          {
            manifest_version: 3,
            name: "AI Link Archive",
            description: "Save the current page into AI Link Archive.",
            version: "0.1.0",
            action: {
              default_popup: "index.html",
              default_title: "Save to AI Link Archive",
            },
            background: {
              service_worker: "assets/background.js",
              type: "module",
            },
            permissions: ["activeTab", "scripting", "identity", "storage"],
            oauth2: {
              client_id: oauthClientId,
              scopes: ["openid", "email", "profile"],
            },
            icons: {
              16: "icons/icon16.svg",
              32: "icons/icon32.svg",
              48: "icons/icon48.svg",
              128: "icons/icon128.svg",
            },
            content_security_policy: {
              extension_pages:
                "script-src 'self'; object-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://firestore.googleapis.com",
            },
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  return {
    root: ".",
    envDir: "..",
    plugins: [
      react(),
      manifestPlugin(
        env.VITE_FIREBASE_EXTENSION_OAUTH_CLIENT_ID ||
          env.VITE_FIREBASE_GOOGLE_CLIENT_ID ||
          "__REPLACE_WITH_EXTENSION_OAUTH_CLIENT_ID__",
      ),
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "index.html"),
          background: path.resolve(__dirname, "src/background/index.ts"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
    test: {
      environment: "node",
      globals: true,
    },
  };
});
