# ExamLens

> Know what's coming. Study what matters.

Private, offline exam prep: upload your syllabus, notes and past papers; see which topics keep getting asked and
ask doubts answered from your own notes. Runs on local models via Ollama.

**Status:** Session 1 done (auth, notebooks, uploads). AI service, Ask and Analyzer come next.
Full README with architecture and screenshots arrives in Session 3.

## Run it locally

Needs Node 20+, Docker Desktop.

```bash
docker compose up -d                          # MongoDB :27017 + Qdrant :6333

cd server && cp .env.example .env             # then put real random values in the secrets
npm install && npm run dev                    # API on http://localhost:5000/api/v1

cd client && cp .env.example .env
npm install && npm run dev                    # app on http://localhost:5173
```

API tests: `npx newman run postman/ExamLens.postman_collection.json` (from the repo root, with the server running),
or import the collection into Postman.
