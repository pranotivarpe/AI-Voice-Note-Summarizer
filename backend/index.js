// index.js
// Main backend file: sets up Express server and defines API endpoints.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");


const { AssemblyAI } = require("assemblyai");
const aai = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY,
});

const app = express();
const port = process.env.PORT || 5001;


app.use(
    cors({
        origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    })
);


app.use(express.json());

// Configure multer to store uploaded audio files in a temporary folder
const upload = multer({ dest: "uploads/" });

/**
 * POST /api/transcribe-and-summarize
 * This endpoint receives an audio file, sends it to AssemblyAI to transcribe,
 * then sends the transcript to OpenAI to get a summary and action items.
 */
app.post(
    "/api/transcribe-and-summarize",
    upload.single("audio"),
    async (req, res) => {
        try {
            const audioFilePath = req.file.path;

            const audioData = fs.readFileSync(audioFilePath);

            const transcript = await aai.transcripts.transcribe({
                audio: audioData,
            });

            if (!transcript.text) {
                throw new Error("Transcription is empty or failed");
            }

            const transcriptText = transcript.text;

            // 5) Call OpenAI to summarize transcript and extract action items

            const openrouterResponse = await axios.post(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    model: "nex-agi/deepseek-v3.1-nex-n1:free",  // example free model id
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a helpful assistant that summarizes voice notes into key points and action items.",
                        },
                        {
                            role: "user",
                            content: `
Here is a voice note transcript:

"${transcriptText}"

Return ONLY valid JSON (no backticks, no markdown) with this exact shape:
{
  "key_points": ["point 1", "point 2", ...],
  "action_items": ["item 1", "item 2", ...]
}
`,

                        },
                    ],
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "http://localhost:3000", // your app/site URL (recommended)
                        "X-Title": "AI Voice Note Summarizer",   // app name (optional but recommended)
                    },
                }
            );

            const rawSummary = openrouterResponse.data.choices[0].message.content;

            // Try to parse the model output as JSON
            let parsedSummary;
            try {
                parsedSummary = JSON.parse(rawSummary);
            } catch (e) {
                // If parsing fails, fall back to simple lists
                parsedSummary = {
                    key_points: [rawSummary],
                    action_items: [],
                };
            }

            res.json({
                transcript: transcriptText,
                summary: parsedSummary,
            });




            fs.unlinkSync(audioFilePath);
        } catch (error) {
            console.error(
                "BACKEND ERROR:",
                error.config?.url,
                error.response?.status,
                error.response?.data || error.message
            );

            return res.status(500).json({
                error: error.response?.data || error.message || "Something went wrong",
            });
        }
    }
);

// Start the server
app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
});
