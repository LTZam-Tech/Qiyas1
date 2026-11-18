# Qiyas — on-premises installation

One installation per government entity, with its own database, files, users and settings
([docs/phase1/09-deployment.md](../docs/phase1/09-deployment.md)). Everything runs in containers:

| Service | What it does | Reachable from |
|---|---|---|
| `web` | Nginx: the web app, TLS, security headers, `/api` proxy | users (ports 80 → 443) |
| `api` | Business logic, permissions, deadline scheduler, emails | `web` only |
| `db` | PostgreSQL 16: all records and the audit log | `api` only |
| `redis` | Sessions, rate limits, queues | `api` only |
| `minio` | Evidence files and library documents (content-addressed, private) | `api` only |
| `clamav` | Scans every upload before anyone can use it | `api` only |

The data services sit on an internal network with no route out; only ClamAV's signature
updater can reach its mirror.

## Requirements

- Linux server (or VM) with Docker Engine 24+ and the Compose plugin.
- Small installation (≤ 200 users): 4 vCPU / 16 GB RAM; disk 100 GB for the database, 500 GB+ for evidence.
- A TLS certificate for the address users will type (an internal CA is fine).
- ClamAV signatures: internet access to `database.clamav.net`, or an internal mirror.

## Install

1. Copy the release folder to the server. Verify it **before** loading anything:
   - Get the IltizamTech release public key (`qiyas-release.pub`) and the published SHA-256 of
     `SHA256SUMS` through a separate channel (not from the release folder).
   - Check the signature of the manifest:
     `minisign -V -p qiyas-release.pub -m SHA256SUMS` (signature `SHA256SUMS.minisig`), or for a
     cosign-signed release `cosign verify-blob --key qiyas-release.pub --signature SHA256SUMS.sig SHA256SUMS`.
     Stop if it fails, or if the release has no signature file.
   - Compare `sha256sum SHA256SUMS` with the published digest.
   - Only then check the files:  `sha256sum -c SHA256SUMS`
2. Load the images (offline):  `docker load -i images.tar`
3. Settings:  `cp .env.example .env`, then replace every `CHANGE-ME` (`openssl rand -base64 48` makes good secrets). Set `CORS_ORIGIN` to the site address.
4. Certificate: put `fullchain.pem` and `privkey.pem` in `./certs`. Without them the site starts with a temporary self-signed certificate.
5. Start:  `docker compose up -d`. The first start downloads ClamAV signatures (a few minutes); the API waits for it.
6. Check:  `curl -k https://localhost/api/v2/public/health` → `"status": "healthy"`, storage `minio`, scanner `clamav`.
7. First administrator:
   ```
   docker compose exec -e QIYAS_ADMIN_PASSWORD='a long password' api node dist/compliance/cli/createAdmin.js --email admin@entity.gov.sa --name "System Administrator" --name-ar "مدير النظام"
   ```
   Without `QIYAS_ADMIN_PASSWORD` a temporary password is generated and shown once.
   More accounts, one role each (until the administration screens can create users):
   ```
   docker compose exec -e QIYAS_USER_PASSWORD='a long password' api node dist/compliance/cli/createUser.js --email sara@entity.gov.sa --name "Sara" --role EMP --department IT --department-name-ar "إدارة تقنية المعلومات" --department-name-en "Information Technology"
   ```
   Roles: `QC` consultant, `DM` department manager, `EMP` employee (both need `--department`), `DSO` submission officer, `EXE` executive, `ADM` administrator.
   On a **test** installation, one account per role (two consultants, managers and employees in IT and HR) with generated passwords shown once:
   `docker compose exec api node dist/compliance/cli/createUser.js --test-users --domain test.example.com --confirm-test`
8. Sign in as the administrator and, under **Administration**:
   - **Organization**: the entity's name in Arabic and English, default language and logo (shown on the sign-in page and in reports).
   - Departments, managers and members; role grants (consultants, submission officers, executives).
   - Deadlines (SLA policies).
   The official DGA standards **v5.0** and **v4.0**, their crosswalk, and the regulations catalogue are loaded automatically at first start. A consultant then creates the measurement cycle.

## Sharing a server with other sites

When the server already runs a web server for other sites on ports 80/443, Qiyas must not take those
ports. Run it behind that web server instead:

1. Start Qiyas on the local port only (127.0.0.1:8088, not reachable from outside):
   `docker compose -f docker-compose.yml -f docker-compose.behind-proxy.yml up -d --build`
   (use the same `-f … -f …` pair for every later `docker compose` command, or set
   `COMPOSE_FILE=docker-compose.yml:docker-compose.behind-proxy.yml` in `.env`).
2. Add a site for the Qiyas domain to the existing web server. For nginx: `host-nginx-qiyas.conf`
   (copy to `/etc/nginx/sites-available/qiyas`, set `server_name`, link it into `sites-enabled`, `nginx -t`, reload).
3. Certificate through that web server, which keeps serving the other sites: `certbot --nginx -d <domain>`.
   Renewal is automatic (certbot's timer) and needs no Qiyas restart. `./certs` is not used in this mode.

Other sites are untouched: only requests for the Qiyas domain are forwarded.

## Upgrade

1. Back up (below).
2. Verify the new release exactly as in Install step 1 (signature of `SHA256SUMS`, its published
   digest, then `sha256sum -c SHA256SUMS`). Then `docker load -i images.tar` from the new
   release, set `QIYAS_VERSION` in `.env`.
3. `docker compose up -d`. Database migrations run at start-up; each runs once and is checksum-verified.
   New DGA framework versions in the release are imported; existing ones are never changed.

Rollback: restore the backup taken in step 1 and start the previous version.

## Backup and restore

```
# database (nightly; keep 30 daily + 12 monthly)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > qiyas-$(date +%F).dump
# evidence files
docker run --rm -v qiyas_minio_data:/data -v "$PWD":/backup alpine tar czf /backup/qiyas-files-$(date +%F).tgz -C /data data
```

Restore into a stopped installation: `pg_restore --clean -d <db>` the dump and untar the files into the `qiyas_minio_data` volume.
Test a restore every quarter.

## Operations

- Health: `GET /api/v2/public/health` (database, storage, scanner). Container health checks use it.
- Logs: `docker compose logs -f api` (structured JSON in production).
- Run the deadline scheduler on one API instance only (`QIYAS_SCHEDULER=off` on others).
- Keep the server clock NTP-synchronized; dates are stored in UTC and shown in Riyadh time.
- Without ClamAV the API refuses to start in production. `QIYAS_ALLOW_DEV_SCANNER=true` overrides this for a test installation only.

## Making a release (IltizamTech)

`./make-release.sh 1.0.0` builds the images and writes `release/qiyas-1.0.0/` with `images.tar`,
the compose file without build steps, `.env.example`, this guide and `SHA256SUMS`. No client data
is ever part of a release.

The manifest is signed: with minisign (`QIYAS_MINISIGN_KEY=<secret key>`, writes
`SHA256SUMS.minisig`) or cosign (`QIYAS_COSIGN_KEY=<key>`, writes `SHA256SUMS.sig`). Without a
signing tool and key the script stops (`QIYAS_ALLOW_UNSIGNED=1` is for internal test builds only).
If `syft` is installed, CycloneDX SBOMs of the two Qiyas images are added and covered by the
manifest. Publish the public key and the printed digest of `SHA256SUMS` out of band; the secret
key never leaves the release machine.
