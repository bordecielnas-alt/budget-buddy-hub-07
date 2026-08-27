#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
CONFIG_DIR="$DATA_DIR/config"
CONFIG_FILE="$CONFIG_DIR/database.env"
APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"

# --- 0. Droits du volume monté (nécessite root au démarrage) ------------------
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R "$APP_UID:$APP_GID" "$DATA_DIR" 2>/dev/null || \
    echo "[init] Avertissement : impossible de corriger les droits de $DATA_DIR"
  # on relance ce script sans privilèges
  exec su-exec "$APP_UID:$APP_GID" "$0" "$@"
fi

# --- 1. Initialisation de l'arborescence persistante -------------------------
if ! mkdir -p "$CONFIG_DIR" "$DATA_DIR/exports" "$DATA_DIR/backups" "$DATA_DIR/cache"; then
  echo "----------------------------------------------------------------"
  echo "[erreur] Écriture impossible dans $DATA_DIR (droits du volume hôte)."
  echo "Sur l'hôte : sudo chown -R $APP_UID:$APP_GID ./data"
  echo "----------------------------------------------------------------"
  exit 1
fi


# --- 2. Fichier de configuration base de données (créé au premier démarrage) --
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'EOF'
# Budget Tracker - configuration base de donnees / backend
# Fichier persistant : monte depuis l'hote (./data/config/database.env)
# Renseignez les valeurs puis redemarrez : docker compose restart app

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EOF
  chmod 600 "$CONFIG_FILE" 2>/dev/null || true
  echo "[init] Fichier de configuration cree : $CONFIG_FILE"
fi

# --- 3. Chargement : le fichier persistant ne remplace pas l'env explicite ----
# shellcheck disable=SC1090
while IFS='=' read -r key value; do
  case "$key" in
    ''|\#*) continue ;;
  esac
  # n'ecrase pas une variable deja fournie par docker-compose / -e
  current="$(printenv "$key" 2>/dev/null || true)"
  if [ -z "$current" ] && [ -n "$value" ]; then
    export "$key=$value"
  fi
done < "$CONFIG_FILE"

# --- 4. Validation avant demarrage ------------------------------------------
missing=""
for var in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  eval "val=\${$var}"
  [ -z "$val" ] && missing="$missing $var"
done

if [ -n "$missing" ]; then
  echo "----------------------------------------------------------------"
  echo "[erreur] Variables backend manquantes :$missing"
  echo "Renseignez-les dans $CONFIG_FILE (cote hote : ./data/config/database.env)"
  echo "ou dans le fichier .env utilise par docker compose, puis :"
  echo "  docker compose restart app"
  echo "----------------------------------------------------------------"
  exit 1
fi

echo "[init] DATA_DIR=$DATA_DIR | backend=${SUPABASE_URL}"
exec "$@"
