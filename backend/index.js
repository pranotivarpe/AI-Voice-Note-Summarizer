// index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");

const { AssemblyAI } = require("assemblyai");
const aai = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

const app = express();
const port = process.env.PORT || 5001;

app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] }));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// jobId -> { status, transcript, summary, mode, error, createdAt }
const jobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
    }
}, 5 * 60 * 1000);

const MODE_PROMPTS = {
    general: {
        system: "You are a helpful assistant that summarizes voice notes into key points and action items.",
        user: (text) => `
Here is a voice note transcript:

"${text}"

Return ONLY valid JSON (no backticks, no markdown):
{
  "key_points": ["concise key point 1", ...],
  "action_items": ["clear action item 1", ...]
}`,
    },
    meeting: {
        system: "You are an expert meeting assistant. Extract the key decisions made and concrete follow-up tasks with owners or deadlines when mentioned.",
        user: (text) => `
Here are the notes from a meeting:

"${text}"

Return ONLY valid JSON (no backticks, no markdown):
{
  "key_points": ["decision or outcome 1 — be specific about what was agreed", ...],
  "action_items": ["[Owner if mentioned] Action to take by [deadline if mentioned]", ...]
}`,
    },
    brainstorm: {
        system: "You are a creative thinking assistant. Identify the core concepts and the most promising next steps from a brainstorm session.",
        user: (text) => `
Here is a brainstorm voice note:

"${text}"

Return ONLY valid JSON (no backticks, no markdown):
{
  "key_points": ["core concept or insight 1", ...],
  "action_items": ["next step to explore or validate 1", ...]
}`,
    },
    study: {
        system: "You are a study assistant. Extract the most important facts, definitions, and concepts from a study note, and list what the student should review or practice.",
        user: (text) => `
Here is a study session voice note:

"${text}"

Return ONLY valid JSON (no backticks, no markdown):
{
  "key_points": ["key fact, concept, or definition 1", ...],
  "action_items": ["topic or concept to review/practice 1", ...]
}`,
    },
};

async function summarizeTranscript(transcriptText, mode = "general") {
    const prompt = MODE_PROMPTS[mode] || MODE_PROMPTS.general;

    const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            model: "openai/gpt-oss-120b:free",
            messages: [
                { role: "system", content: prompt.system },
                { role: "user", content: prompt.user(transcriptText) },
            ],
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "AI Voice Note Summarizer",
            },
        }
    );

    const raw = response.data.choices[0].message.content;

    try {
        return JSON.parse(raw);
    } catch {
        return { key_points: [raw], action_items: [] };
    }
}

async function runJob(jobId, audioFilePath, mode) {
    const job = jobs.get(jobId);

    try {
        job.status = "transcribing";
        const audioData = fs.readFileSync(audioFilePath);
        const transcript = await aai.transcripts.transcribe({ audio: audioData });

        if (!transcript.text) throw new Error("Transcription is empty or failed");

        job.transcript = transcript.text;
        job.status = "summarizing";
        job.summary = await summarizeTranscript(transcript.text, mode);
        job.status = "done";
    } catch (error) {
        console.error("JOB ERROR:", jobId, error.response?.data || error.message);
        job.status = "error";
        job.error = error.response?.data || error.message || "Something went wrong";
    } finally {
        fs.unlink(audioFilePath, () => {});
    }
}

app.post("/api/jobs", upload.single("audio"), (req, res) => {
    const jobId = crypto.randomUUID();
    const mode = req.body.mode || "general";

    jobs.set(jobId, {
        status: "transcribing",
        transcript: null,
        summary: null,
        mode,
        error: null,
        createdAt: Date.now(),
    });

    runJob(jobId, req.file.path, mode);
    res.json({ jobId });
});

app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    res.json({
        status: job.status,
        transcript: job.transcript,
        summary: job.summary,
        mode: job.mode,
        error: job.error,
    });
});

app.post("/api/summarize", async (req, res) => {
    try {
        const { transcript, mode } = req.body;
        if (!transcript?.trim()) return res.status(400).json({ error: "transcript is required" });

        const summary = await summarizeTranscript(transcript, mode);
        res.json({ summary });
    } catch (error) {
        console.error("SUMMARIZE ERROR:", error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data || error.message || "Something went wrong" });
    }
});

app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
