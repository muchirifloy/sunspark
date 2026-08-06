#!/usr/bin/env bash
set -Eeuo pipefail

# HostAfrica backend deploy for backend.sunsparkelectricals.co.ke.
# Run from SSH:
#   cd ~/sunsparkbackend
#   bash docs/hostafrica-deploy.sh

APP_DIR="${APP_DIR:-$HOME/sunsparkbackend}"
REPO_URL="${REPO_URL:-https://github.com/muchirifloy/sunspark.git}"
BRANCH="${BRANCH:-main}"
NODE_ENV_DIR="${NODE_ENV_DIR:-}"
RUN_MIGRATE="${RUN_MIGRATE:-1}"
RUN_SEED="${RUN_SEED:-0}"
RUN_LEGACY_IMPORT="${RUN_LEGACY_IMPORT:-0}"
BUILD_ON_HOST="${BUILD_ON_HOST:-0}"
API_ROOT="$APP_DIR/apps/api"
UPLOADS_DIR="$API_ROOT/public/uploads"
UPLOADS_BACKUP_DIR="${UPLOADS_BACKUP_DIR:-$HOME/sunsparkbackend-storage/uploads}"

copy_uploads() {
  source_dir="$1"
  target_dir="$2"
  [ -d "$source_dir" ] || return 0

  mkdir -p "$target_dir"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$source_dir/" "$target_dir/"
  else
    cp -a "$source_dir"/. "$target_dir/"
  fi
}

find_node_env_dir() {
  if [ -n "$NODE_ENV_DIR" ] && [ -f "$NODE_ENV_DIR/bin/activate" ]; then
    printf '%s\n' "$NODE_ENV_DIR"
    return
  fi

  if [ -d "$HOME/nodevenv" ]; then
    found="$(find "$HOME/nodevenv" -path '*sunsparkbackend*apps*api*/bin/activate' -print -quit 2>/dev/null || true)"
    if [ -n "$found" ]; then
      dirname "$(dirname "$found")"
      return
    fi
  fi

  printf '%s\n' ""
}

link_cloudlinux_node_modules() {
  node_env_dir="$1"
  [ -n "$node_env_dir" ] || return 0

  modules_target="$node_env_dir/lib/node_modules"
  [ -d "$modules_target" ] || return 0

  if [ -e "$API_ROOT/node_modules" ] && [ ! -L "$API_ROOT/node_modules" ]; then
    backup="$API_ROOT/node_modules.backup.$(date +%Y%m%d-%H%M%S)"
    echo "==> Moving non-symlink node_modules to $backup"
    mv "$API_ROOT/node_modules" "$backup"
  fi

  if [ ! -e "$API_ROOT/node_modules" ]; then
    echo "==> Linking CloudLinux node_modules virtualenv"
    ln -s "$modules_target" "$API_ROOT/node_modules"
  fi
}

echo "==> Pulling Sunspark backend"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

echo "==> Preserving uploaded images outside the Git checkout"
copy_uploads "$UPLOADS_DIR" "$UPLOADS_BACKUP_DIR"

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
git log -1 --oneline

echo "==> Restoring persistent uploaded images"
copy_uploads "$UPLOADS_BACKUP_DIR" "$UPLOADS_DIR"

NODE_ENV_DIR="$(find_node_env_dir)"

if [ -n "$NODE_ENV_DIR" ] && [ -f "$NODE_ENV_DIR/bin/activate" ]; then
  echo "==> Activating Node virtualenv: $NODE_ENV_DIR"
  set +u
  # shellcheck source=/dev/null
  source "$NODE_ENV_DIR/bin/activate"
  set -u
else
  echo "==> No CloudLinux Node virtualenv detected. Using current node/npm."
fi

export NODE_ENV=production
export NPM_CONFIG_PRODUCTION=false
export NEXT_TELEMETRY_DISABLED=1

cd "$API_ROOT"

link_cloudlinux_node_modules "$NODE_ENV_DIR"

LOCKFILE_MARKER="$API_ROOT/.package-lock.sha256"
LOCKFILE_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
if [ ! -f "$LOCKFILE_MARKER" ] || [ "$(cat "$LOCKFILE_MARKER")" != "$LOCKFILE_HASH" ]; then
  echo "==> Installing backend dependencies for updated package lock"
  npm install --include=dev --no-audit --no-fund --legacy-peer-deps --prefer-offline --maxsockets=1
  printf '%s\n' "$LOCKFILE_HASH" > "$LOCKFILE_MARKER"
else
  echo "==> Backend dependencies already match package lock"
fi

if [ "$RUN_MIGRATE" = "1" ]; then
  echo "==> Applying SQL schema"
  npm run migrate
fi

if [ "$RUN_SEED" = "1" ]; then
  echo "==> Seeding admin/categories/settings"
  npm run seed
fi

if [ "$RUN_LEGACY_IMPORT" = "1" ]; then
  echo "==> Importing existing Prisma-table data into SQL API tables"
  npm run import:legacy
fi

if [ "$BUILD_ON_HOST" = "1" ]; then
  echo "==> Building backend on host"
  npm run build
else
  echo "==> Skipping host build. Using committed apps/api/dist."
fi

echo "==> Restarting cPanel Node app"
mkdir -p "$API_ROOT/tmp"
touch "$API_ROOT/tmp/restart.txt"

echo "==> Done"
