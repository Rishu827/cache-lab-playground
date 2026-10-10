import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the static build works on GitHub Pages, Vercel, or inside an iframe from any path.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
