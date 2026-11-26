# ExamLens

> Know what's coming. Study what matters.

Private, offline exam prep: upload your syllabus, notes and past papers; see which topics keep getting asked and
ask doubts answered from your own notes. Runs on local models via Ollama.

**Status:** Sessions 1–2 done: auth, notebooks, uploads, AI ingest, Ask (streamed, cited answers) and the Analyzer.
Full README with architecture and screenshots arrives in Session 3.

## Run it locally

Needs Node 20+, Python 3.11+, Docker Desktop and [Ollama](https://ollama.com) with the models:
`ollama pull qwen2.5:3b` and `ollama pull nomic-embed-text`.

```bash
docker compose up -d                          # MongoDB :27017 + Qdrant :6333

cd server && cp .env.example .env             # then put real random values in the secrets
npm install && npm run dev                    # API on http://localhost:5000/api/v1

cd ai-service && cp .env.example .env         # SERVICE_KEY must match server/.env
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # (macOS/Linux: .venv/bin/pip)
.venv/Scripts/python -m uvicorn app.main:app --port 8000                # AI service on :8000

cd client && cp .env.example .env
npm install && npm run dev                    # app on http://localhost:5173
```

API tests: `npx newman run postman/ExamLens.postman_collection.json` (from the repo root, with the server running),
or import the collection into Postman.
