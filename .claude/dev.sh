#!/bin/bash
export PATH="/Users/punitgoswami/.nvm/versions/node/v22.21.1/bin:$PATH"
# When a PORT is injected (e.g. by the preview runner with autoPort), bind to it
# strictly so the proxy can reach us. Otherwise fall back to vite's defaults.
if [ -n "$PORT" ]; then
  exec npm run dev -- --port "$PORT" --strictPort
else
  exec npm run dev
fi
