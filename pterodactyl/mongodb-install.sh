#!/bin/bash
# MongoDB egg installer. Runs in mongo:8-noble as root, with the server's files
# at /mnt/server. Safe to rerun: existing data is kept, and both users are
# created or updated to the passwords currently set on the server, so a
# Reinstall is also how you change a password.
#
# This file is the source of the egg's installation script. After editing it,
# regenerate egg-mongodb.json with: node pterodactyl/build-mongodb-egg.mjs
set -euo pipefail

for v in MONGO_ADMIN_USER MONGO_ADMIN_PASSWORD MONGO_APP_USER MONGO_APP_PASSWORD MONGO_APP_DATABASE; do
  if [ -z "${!v:-}" ]; then
    echo "FATAL: ${v} is empty. Set it on the server's Startup tab and reinstall." >&2
    exit 1
  fi
done

DB_DIR=/mnt/server/db
LOG=/mnt/server/install-mongod.log
PORT=27017
mkdir -p "${DB_DIR}"
cd /mnt/server

if [ -n "$(ls -A "${DB_DIR}")" ]; then
  echo "Existing data in ${DB_DIR}: keeping it and updating the users."
else
  echo "Empty ${DB_DIR}: creating a new database."
fi

# A temporary mongod without auth, reachable only from inside this install
# container, to manage the users. The server itself always runs with --auth.
mongod --dbpath "${DB_DIR}" --bind_ip 127.0.0.1 --port "${PORT}" --nounixsocket \
  --fork --logpath "${LOG}"

cleanup() {
  mongod --dbpath "${DB_DIR}" --shutdown >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Passwords are read from the environment inside mongosh, so no quoting of
# them happens in the shell.
cat > /tmp/users.js <<'JS'
function upsert(user, pwd, roles) {
  const admin = db.getSiblingDB('admin');
  if (admin.getUser(user)) {
    admin.updateUser(user, { pwd, roles });
    print(`updated user ${user}`);
  } else {
    admin.createUser({ user, pwd, roles });
    print(`created user ${user}`);
  }
}
const env = process.env;
if (env.MONGO_ADMIN_USER === env.MONGO_APP_USER) {
  throw new Error('MONGO_ADMIN_USER and MONGO_APP_USER must differ');
}
upsert(env.MONGO_ADMIN_USER, env.MONGO_ADMIN_PASSWORD, ['root']);
upsert(env.MONGO_APP_USER, env.MONGO_APP_PASSWORD, [{ role: 'readWrite', db: env.MONGO_APP_DATABASE }]);
JS
mongosh --quiet --port "${PORT}" --file /tmp/users.js
rm -f /tmp/users.js

cleanup
trap - EXIT
rm -f "${LOG}"

echo "-----------------------------------------"
echo " MongoDB installed. Press Start in the panel."
echo " App connection string (use the server's IP and port):"
echo "   mongodb://${MONGO_APP_USER}:<password>@<ip>:<port>/${MONGO_APP_DATABASE}?authSource=admin"
echo "-----------------------------------------"
