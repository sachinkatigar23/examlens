# Deploying the public demo

ExamLens as a public demo on one **Oracle Cloud "Always Free" ARM VM**: Ampere A1, 2 OCPU, 12 GB RAM, no GPU,
Ubuntu 24.04 (aarch64). Everything runs in Docker from [`docker-compose.prod.yml`](../docker-compose.prod.yml):

```
Internet ──► Caddy :80/:443 (auto HTTPS) ──► client (nginx: React app, /api ──►) server ──► ai-service ──► ollama (CPU)
                                                                                 │              └──► qdrant
                                                                                 └──► mongo
```

Only Caddy publishes ports. Ollama runs in a container on the CPU, so local answers are slow (often 1–3 minutes).
That's why the demo seed **pre-writes** every question-bank answer, lesson and revision sheet, and why a Gemini
key (Cloud mode) is worth adding: visitors then get Cloud answers by default, with a per-IP limit.

What `PUBLIC_DEMO=true` (the default in the prod compose) changes:

- Sign-ups are closed. The login page shows the demo account and a "Use the demo account" button.
- The demo account is **read-only**: no uploads, deletes, edits, "Answer all", photo doubts or exam plans. It can
  still browse everything, **Ask**, **Study** and **Check my answer**. Its questions and checks are answered but not
  saved, so visitors never see each other's chats.
- A banner on every page: "Public demo: answers may take a moment".
- Answers default to **Cloud** when `GEMINI_API_KEY` is set (Local otherwise).
- Limits per visitor IP: 5 answers per 5 minutes, 30 per day, 5 Cloud answers per day (on top of Gemini's own
  daily quota), and at most 2 answers generated at once on the whole server.

Commands below are run **on the VM** unless they say otherwise. Replace `examlens.example.com` with your domain.

---

## 1. Before you start (in the Oracle Cloud console)

1. Create the instance: shape **VM.Standard.A1.Flex**, 2 OCPU, 12 GB, image **Canonical Ubuntu 24.04**
   (aarch64). Boot volume 50 GB or more (images + models need ~15 GB).
2. **Networking → Virtual Cloud Networks → your VCN → Security Lists → Default Security List → Add Ingress
   Rules**: source `0.0.0.0/0`, TCP, destination ports `80,443`. (Optional: UDP 443 for HTTP/3.)
   This is Oracle's cloud firewall; Ubuntu's own firewall (step 3) blocks them too.
3. At your DNS provider, add an **A record**: `examlens.example.com` → the instance's public IP.
   Caddy can only get a certificate once this resolves (check with `nslookup examlens.example.com`).

## 2. Install Docker

```bash
ssh ubuntu@<public-ip>

sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker ubuntu
exit                      # log out and back in so the docker group applies
ssh ubuntu@<public-ip>
docker run --rm hello-world
```

## 3. Open ports 80 and 443 in Ubuntu's iptables

Oracle's Ubuntu images ship with iptables rules that reject everything except SSH. Insert ACCEPT rules
**before** the `REJECT` line and save them so they survive reboots:

```bash
sudo iptables -L INPUT --line-numbers -n     # find the line number of "REJECT all" (usually 5 or 6)

sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save

sudo iptables -L INPUT --line-numbers -n     # the three ACCEPT rules are now above REJECT
```

(Use the REJECT line's number instead of `5` if it differs. Don't run `ufw enable` as well: it fights with these rules.)

## 4. Clone and configure

```bash
cd ~
git clone https://github.com/sachinkatigar23/examlens.git
cd examlens

# .env: compose reads it. New random secrets, generated here, never copied from anywhere.
cat > .env <<EOF
DOMAIN=examlens.example.com
JWT_ACCESS_SECRET=$(openssl rand -hex 48)
JWT_REFRESH_SECRET=$(openssl rand -hex 48)
SERVICE_KEY=$(openssl rand -hex 32)
PUBLIC_DEMO=true
DEMO_EMAIL=demo@examlens.local
DEMO_PASSWORD=examlens-demo
EOF
chmod 600 .env

# ai-service/.env: only the optional Cloud settings (the prod compose sets everything else).
# Paste a key from https://aistudio.google.com/apikey after GEMINI_API_KEY= to enable Cloud, or leave it empty.
cat > ai-service/.env <<'EOF'
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_DAILY_LIMIT=20
EOF
chmod 600 ai-service/.env
nano ai-service/.env       # optional: add the Gemini key
```

`DEMO_PASSWORD` is shown on the login page on purpose (it's a shared demo), so don't reuse a real password.

## 5. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build     # first build on 2 cores: ~10 minutes
docker compose -f docker-compose.prod.yml ps                 # all "healthy" / "running"
docker compose -f docker-compose.prod.yml logs -f caddy      # watch for "certificate obtained successfully", then Ctrl+C
```

## 6. Pull the models into the Ollama container

They go into the `ollama_models` volume, so this is needed once (about 2.3 GB):

```bash
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:3b
docker compose -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
docker compose -f docker-compose.prod.yml exec ollama ollama list

curl -s https://examlens.example.com/api/v1/health
# {"status":"ok","mongo":true,"ai":{"qdrant":true,"ollama":true,"models":{...both true...},"ok":true}}
```

## 7. Seed the demo

Creates the demo account, uploads `demo-data/`, waits for processing, then pre-writes every question-bank answer,
every topic's lesson and every unit's revision sheet. On 2 CPU cores with local models this takes **a few hours**,
so run it in the background. It is resumable: if it stops, run the same command again and it continues.

```bash
nohup docker compose -f docker-compose.prod.yml --profile demo run --rm seed > seed.log 2>&1 &
tail -f seed.log         # Ctrl+C stops watching, not the seed
```

`SEED_MODE=cloud` in `.env` writes with Gemini instead (much faster), but the free tier (~20 requests/day) won't
cover a whole notebook; the seed stops the bank job when the quota runs out, and you can switch back to local and
re-run it to finish.

When `seed.log` ends with `[seed] done.`, save a snapshot so the demo can be reset in seconds later:

```bash
chmod +x scripts/reset-demo.sh
scripts/reset-demo.sh save
```

Open `https://examlens.example.com`, click **Log in → Use the demo account**.

## 8. Update to a new version

```bash
cd ~/examlens
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
```

Data (MongoDB, Qdrant, uploads, models, certificates) lives in named volumes and survives rebuilds.
If `demo-data/` changed, rebuild the demo notebook and take a new snapshot:

```bash
scripts/reset-demo.sh reseed && scripts/reset-demo.sh save
```

## 9. Day-to-day

| Task | Command |
|---|---|
| Reset the demo to the snapshot | `scripts/reset-demo.sh` |
| Reset it every night at 04:15 | `crontab -e`, add `15 4 * * * cd /home/ubuntu/examlens && scripts/reset-demo.sh >> reset-demo.log 2>&1` |
| Logs of one service | `docker compose -f docker-compose.prod.yml logs -f --tail 100 server` |
| Memory per container | `docker stats --no-stream` |
| Restart everything | `docker compose -f docker-compose.prod.yml restart` |
| Stop everything | `docker compose -f docker-compose.prod.yml down` (add `-v` only to delete all data) |

Memory limits (sum ~10 GB of the 12): ollama 5 GB, ai-service 1.5 GB, mongo 1 GB, qdrant 1 GB, server 512 MB,
caddy 256 MB, seed 256 MB, client 128 MB. All containers have `restart: always`, so they come back after a reboot.

## Troubleshooting

- **No certificate / browser says "not secure"**: the A record must point at the VM, and ports 80 and 443 must be
  open in *both* the Oracle security list (step 1) and iptables (step 3). `docker compose -f docker-compose.prod.yml logs caddy`
  shows the reason. Test from your laptop: `curl -I http://examlens.example.com` should answer `308` (redirect).
- **"Local model is offline" or "Model … is not installed"**: step 6 wasn't done, or `ollama` is restarting
  (`docker compose -f docker-compose.prod.yml ps ollama`).
- **"The demo is busy answering other visitors"**: more than `DEMO_MAX_CONCURRENT` answers at once. Expected on a
  CPU-only box; raise it in `.env` only if answers stay fast enough.
- **Cloud isn't offered**: `GEMINI_API_KEY` is empty in `ai-service/.env`. After editing it:
  `docker compose -f docker-compose.prod.yml up -d ai-service`.
- **Everyone shares one rate limit**: the visitor IP is lost somewhere. It should arrive as Caddy → `X-Forwarded-For`
  → client nginx (`set_real_ip_from` in `client/nginx.conf`) → server (`TRUST_PROXY=1`). If you put another proxy
  or a CDN in front of Caddy, configure Caddy's `trusted_proxies` for it.
