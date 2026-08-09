import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works when deployed to any GitHub Pages
// project path (https://<user>.github.io/<repo>/) without extra config.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 8888 },
});
