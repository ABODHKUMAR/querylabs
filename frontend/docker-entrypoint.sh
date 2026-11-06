#!/bin/sh

# Runtime environment variable injection for Vite
# This script replaces placeholder values in the built JS files with actual env vars

# Set defaults if not provided
VITE_HOST_URL=${VITE_HOST_URL:-127.0.0.1}
VITE_PORT_BACKEND_SQL=${VITE_PORT_BACKEND_SQL:-8081}
VITE_PORT_BACKEND_STANDARD=${VITE_PORT_BACKEND_STANDARD:-8084}
VITE_BASE_URL=${VITE_BASE_URL:-}

echo "Injecting runtime environment variables..."
echo "  VITE_HOST_URL: $VITE_HOST_URL"
echo "  VITE_PORT_BACKEND_SQL: $VITE_PORT_BACKEND_SQL"
echo "  VITE_PORT_BACKEND_STANDARD: $VITE_PORT_BACKEND_STANDARD"
echo "  VITE_BASE_URL: $VITE_BASE_URL"

# Replace placeholders in all JS files
find /app/dist/assets -name '*.js' -exec sed -i \
  -e "s|__VITE_HOST_URL__|${VITE_HOST_URL}|g" \
  -e "s|__VITE_PORT_BACKEND_SQL__|${VITE_PORT_BACKEND_SQL}|g" \
  -e "s|__VITE_PORT_BACKEND_STANDARD__|${VITE_PORT_BACKEND_STANDARD}|g" \
  -e "s|__VITE_BASE_URL__|${VITE_BASE_URL}|g" \
  {} \;

echo "Environment variables injected successfully!"

# Execute the main command
exec "$@"
