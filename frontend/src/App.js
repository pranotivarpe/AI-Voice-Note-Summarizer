// App.js
// Main React component: records audio and calls backend API.

import React, { useState, useRef } from "react";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Start recording audio from microphone
  const startRecording = async () => {
    setTranscript("");
    setSummary("");
    setAudioBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  // Stop recording and finalize audio blob
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
    }
  };

  // Send audio to backend for transcription + summarization
  const handleSubmit = async () => {
    if (!audioBlob) {
      alert("Please record a voice note first.");
      return;
    }

    setLoading(true);
    setTranscript("");
    setSummary("");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "note.webm");

      const response = await fetch(
        "http://localhost:5001/api/transcribe-and-summarize",
        {
          method: "POST",
          body: formData,
        }
      );


      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Server error");
      }

      setTranscript(data.transcript);

      setSummary(data.summary);
    } catch (err) {
      console.error(err);
      alert("Failed to process audio.");
    } finally {
      setLoading(false);
    }
  };

  const speakSummary = () => {
    if (!summary) return;

    const keyPointsText = (summary.key_points || [])
      .map((p, i) => `Key point ${i + 1}: ${p}`)
      .join(". ");

    const actionItemsText = (summary.action_items || [])
      .map((a, i) => `Action item ${i + 1}: ${a}`)
      .join(". ");

    const fullText = [
      keyPointsText && `Here are the key points. ${keyPointsText}.`,
      actionItemsText && `Here are the action items. ${actionItemsText}.`,
    ]
      .filter(Boolean)
      .join(" ");

    if (!fullText) return;

    const utterance = new SpeechSynthesisUtterance(fullText);
    window.speechSynthesis.speak(utterance);
  };


  return (
    <div className="app-root">
      <div className="app-card">
        <h1 className="app-title">AI Voice Note Summarizer</h1>
        <p className="app-subtitle">
          Record a quick voice note. The app will transcribe it and summarize
          key points and action items.
        </p>

        <div className="app-top-row">
          {/* Left: recording + preview */}
          <div className="block">
            <div className="block-header">
              <h2 className="block-title">Record</h2>
            </div>

            <div className="btn-row">
              {!isRecording ? (
                <button
                  className="btn btn-primary"
                  onClick={startRecording}
                >
                  <span className="btn-icon">●</span>
                  Start Recording
                </button>
              ) : (
                <button
                  className="btn btn-danger"
                  onClick={stopRecording}
                >
                  <span className="btn-icon">■</span>
                  Stop Recording
                </button>
              )}

              <button
                className="btn btn-secondary"
                onClick={handleSubmit}
                disabled={loading || !audioBlob}
              >
                {loading ? "Processing..." : "Transcribe & Summarize"}
              </button>
            </div>

            <div className="audio-preview">
              <p style={{ marginBottom: 6 }}>Preview your recording:</p>
              {audioBlob ? (
                <audio
                  controls
                  src={URL.createObjectURL(audioBlob)}
                />
              ) : (
                <p style={{ fontSize: 12, color: "#6b7280" }}>
                  No recording yet. Click “Start Recording”.
                </p>
              )}
            </div>
          </div>

          {/* Right: transcript */}
          <div className="block">
            <div className="block-header">
              <h2 className="block-title">Transcript</h2>
            </div>
            <div className="transcript-box">
              {transcript || (
                <span style={{ color: "#9ca3af" }}>
                  Your transcript will appear here after processing.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Summary section */}
        {summary && (
          <div className="summary-box">
            <div className="summary-heading">
              <h2>Summary</h2>
              <div className="summary-meta">Generated by AI</div>
            </div>

            <div className="btn-row" style={{ marginBottom: 10 }}>
              <button className="btn btn-ghost" onClick={speakSummary}>
                🔊 Play Summary
              </button>
            </div>

            <div className="summary-columns">
              <div>
                <div className="summary-column-title">Key Points</div>
                <ul className="summary-list">
                  {summary.key_points?.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="summary-column-title">Action Items</div>
                <ul className="summary-list">
                  {summary.action_items?.map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
