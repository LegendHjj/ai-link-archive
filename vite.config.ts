import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ai-link-archive/",
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
  },
});
