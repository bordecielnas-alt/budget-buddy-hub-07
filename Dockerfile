# syntax=docker/dockerfile:1.7

# --- Build ---
FROM oven/bun:1.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN --mount=type=secret,id=vite_supabase_url,required=false \
    --mount=type=secret,id=vite_supabase_publishable_key,required=false \
    VITE_SUPABASE_URL="$(cat /run/secrets/vite_supabase_url 2>/dev/null || printf 'https://example.invalid')" \
    VITE_SUPABASE_PUBLISHABLE_KEY="$(cat /run/secrets/vite_supabase_publishable_key 2>/dev/null || printf 'sb_publishable_local_build')" \
    bun run build

# --- Runtime ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
COPY --from=build /app/.output ./.output
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN apk add --no-cache su-exec \
 && chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /data && chown -R node:node /data
# On démarre en root pour pouvoir corriger les droits du volume monté,
# puis l'entrypoint abandonne les privilèges vers l'utilisateur `node`.
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
