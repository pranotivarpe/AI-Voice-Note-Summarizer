# 🎙️ AI Voice Note Summarizer

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![AssemblyAI](https://img.shields.io/badge/AssemblyAI-Transcription-F02E65?style=flat-square)
![OpenRouter](https://img.shields.io/badge/OpenRouter-AI%20Summary-412991?style=flat-square)

Record a quick voice note — the app **transcribes** it using AssemblyAI and **summarizes** it into key points and action items using an LLM via OpenRouter, with live progress feedback, an editable transcript, and persistent note history.

---

## Features

- 🎤 **Voice Recording** — record directly in the browser, with a live waveform visualizer (Web Audio API) while you talk
- 📁 **File Upload** — drop in an existing audio file instead of recording
- 📝 **Auto-Transcription** — powered by the AssemblyAI speech-to-text API
- 🤖 **AI Summarization** — extracts key points and action items via an LLM (GPT-OSS-120B via OpenRouter)
- ⏱️ **Real Progress States** — the backend runs transcription/summarization as an async job; the frontend polls and shows live Upload → Transcribe → Summarize steps, not a fake spinner
- ✏️ **Editable Transcript** — fix transcription mistakes, then re-summarize the edited text without re-uploading audio
- 🗂️ **Note History** — every processed note is saved to `localStorage`; browse, reopen, or delete past notes
- 📋 **Copy & Export** — copy the transcript or summary to the clipboard, or export a note as a Markdown file
- 🔊 **Read Aloud** — text-to-speech playback of the generated summary

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 (Create React App), Web Audio API, localStorage |
| Backend | Node.js, Express, Multer (file uploads), in-memory job queue |
| Transcription | AssemblyAI API |
| Summarization | OpenRouter (`openai/gpt-oss-120b:free`) |

---

## Project Structure

```
AI-Voice-Note-Summarizer/
├── backend/
│   ├── index.js              # Express server, job queue, API routes
│   ├── package.json
│   └── uploads/               # Temporary audio file storage
└── frontend/
    ├── src/
    │   ├── App.js              # Recording UI, job polling, results display
    │   ├── App.css
    │   ├── components/
    │   │   └── Waveform.js     # Live mic waveform (Web Audio API + canvas)
    │   └── hooks/
    │       └── useNotes.js     # Note history persisted to localStorage
    └── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 16+
- AssemblyAI API key → [assemblyai.com](https://www.assemblyai.com/)
- OpenRouter API key → [openrouter.ai](https://openrouter.ai/)

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file:

```env
ASSEMBLYAI_API_KEY=your-assemblyai-key
OPENROUTER_API_KEY=your-openrouter-key
PORT=5001
```

```bash
node index.js
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

Visit `http://localhost:3000`

---

## API

| Endpoint | Description |
|---|---|
| `POST /api/jobs` | Accepts an audio file (`multipart/form-data`, field `audio`); starts async transcription + summarization; returns `{ jobId }` immediately |
| `GET /api/jobs/:id` | Returns the job's current `status` (`transcribing` → `summarizing` → `done`/`error`), plus `transcript`/`summary` once available |
| `POST /api/summarize` | Re-summarizes a given `{ transcript }` without re-running transcription — used when the user edits the transcript |

## How It Works

1. User records audio (with a live waveform) or uploads an audio file
2. Frontend `POST`s the audio to `/api/jobs` and receives a `jobId`
3. Backend kicks off an async pipeline: AssemblyAI transcription, then an OpenRouter LLM call for summarization, updating the job's status as it goes
4. Frontend polls `GET /api/jobs/:id` and renders the real Upload → Transcribe → Summarize progress
5. Once done, the transcript and summary (`key_points[]` + `action_items[]`) are shown, and the note is saved to history in `localStorage`
6. The user can edit the transcript and hit "Re-summarize" (`POST /api/summarize`), copy results, export as Markdown, or revisit any past note from the sidebar
