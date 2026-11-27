# Demo data: Computer Networks (sample)

Everything in this folder was made for ExamLens and is free to share. None of it is an official university paper
or a college's material.

| File | What it is | Uploaded as |
|---|---|---|
| `cn-syllabus.pdf` | A 4-unit Computer Networks syllabus (sample) | syllabus |
| `cn-2022.pdf` … `cn-2025.pdf` | Four **generated** model question papers | past papers, 2022–2025 |
| `cn-notes-unit1-…` … `cn-notes-unit4-…` | Short class notes, one per unit, written for the demo | notes for Unit 1–4 |
| `cn-important-questions.pdf` | An "important questions" list grouped by unit and marks | question bank |

`node scripts/seed-demo.mjs` (or `docker compose --profile demo run --rm seed`) uploads all of them into the demo
account. File names decide the kind, so you can drop your own PDFs into another folder and run the seed with
`DEMO_DIR=<folder>`. Keep your college's real material in `samples/`, which is gitignored.
