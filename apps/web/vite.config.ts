import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true
      },
      "/config": {
        target: "http://localhost:3001"
      },
      "/health": {
        target: "http://localhost:3001"
      }
    }
  }
});
