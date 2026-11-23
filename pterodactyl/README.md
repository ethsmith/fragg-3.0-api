# Pterodactyl eggs

| Egg | What it runs |
| --- | --- |
| `egg-fragg-3-0-api.json` | This API (Node 20). |
| `egg-mongodb.json` | MongoDB 8 for the API, in place of Atlas. |

Import an egg from the admin panel: **Nests → (a nest) → Import Egg**.

## MongoDB

`egg-mongodb.json` is generated: edit `mongodb-install.sh` (the install script)
or `build-mongodb-egg.mjs` (everything else), then run
`node pterodactyl/build-mongodb-egg.mjs`.

### Setting it up

1. Create a server from the **MongoDB 8** egg. Give it a port allocation, enough
   disk for the data, and a memory limit at least twice **WiredTiger Cache (GB)**.
2. Set **Admin Password** and **App Password** (12+ characters each). The install
   creates two users in the `admin` database:
   - the admin user, with the `root` role, for mongosh, mongodump and mongorestore;
   - the app user, which can only read and write **App Database** (default `fragg`).
3. Start it. The console prints mongod's log; it is ready at `Waiting for connections`.
4. On the API server, set:
   - `MONGODB_URI` = `mongodb://fragg:<app password>@<ip>:<port>/fragg?authSource=admin`
   - `MONGODB_DATABASE` = blank, or the same name as **App Database**. The app user
     can't touch any other database.

   URL-encode the password if it has characters like `@ : / ? # %`.

To change a password, change the variable and click **Reinstall**. The data is
kept; the install only updates the two users.

Authentication is always on, but the port is reachable from wherever the
allocation's IP is. If only the API (on the same machine) needs it, consider
firewalling the port to everything else.

### Moving off Atlas

The worker can rebuild everything from the demos: point the API at the new
database, set `reparse: true` in the worker's `reparse.yml`, and restart the
worker.

To copy the Atlas data instead (Atlas still allows reads over quota), from a
machine with Docker:

```sh
docker run --rm -v "$PWD:/dump" mongo:8-noble mongodump \
  --uri "<atlas uri>" --db <atlas database> --archive=/dump/fragg.gz --gzip
docker run --rm -v "$PWD:/dump" mongo:8-noble mongorestore \
  --uri "mongodb://admin:<admin password>@<ip>:<port>/?authSource=admin" \
  --archive=/dump/fragg.gz --gzip --nsFrom '<atlas database>.*' --nsTo 'fragg.*'
```
