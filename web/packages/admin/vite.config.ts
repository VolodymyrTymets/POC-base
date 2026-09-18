import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // .env files aren't in process.env yet during config evaluation (Vite loads
  // them later, for app code) — load them here too, so a locally-set
  // WEB_ADMIN_PORT works the same as one already in the shell/container env.
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(process.env.WEB_ADMIN_PORT || env.WEB_ADMIN_PORT) || 5174;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port,
      strictPort: true,
    },
  };
});
