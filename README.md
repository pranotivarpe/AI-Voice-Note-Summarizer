# 🎙️ AI Voice Note Summarizer

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![AssemblyAI](https://img.shields.io/badge/AssemblyAI-Transcription-F02E65?style=flat-square)
![OpenRouter](https://img.shields.io/badge/OpenRouter-AI%20Summary-412991?style=flat-square)

Record a quick voice note — the app automatically **transcribes** it using AssemblyAI and **summarizes** it into key points and action items using an AI language model via OpenRouter.

---

## Features

- 🎤 **Voice Recording** — Record audio directly in the browser
- 📝 **Auto-Transcription** — Powered by AssemblyAI speech-to-text API
- 🤖 **AI Summarization** — Extracts key points and action items via LLM (DeepSeek via OpenRouter)
- ⚡ **Real-time Results** — Instant JSON response with structured output
- 📁 **File Upload** — Also supports uploading existing audio files

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite |
| Backend | Node.js, Express, Multer (file uploads) |
| Transcription | AssemblyAI API |
| Summarization | OpenRouter (DeepSeek v3) |

---

## Project Structure

```
AI-Voice-Note-Summarizer/
├── backend/
│   ├── index.js          # Express server & API routes
│   ├── package.json
│   └── uploads/          # Temporary audio file storage
└── frontend/
    ├── src/
    │   └── App.jsx        # Recording UI and results display
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
npm run dev
```

Visit `http://localhost:3000`

---

## How It Works

1. User records audio or uploads an audio file in the browser
2. Frontend sends the audio to the Express backend via `POST /api/transcribe-and-summarize`
3. Backend uploads audio to AssemblyAI and polls for the transcript
4. Transcript is sent to an LLM (OpenRouter) with a structured prompt
5. LLM returns JSON with `key_points[]` and `action_items[]`
6. Results are displayed in the frontend