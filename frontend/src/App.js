// App.js
import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import "./App.css";
import { useNotes, makeTitle } from "./hooks/useNotes";
import Waveform from "./components/Waveform";

const API_BASE = "http://localhost:5001";

const MODE_CONFIG = {
  general:    { label: "General",    icon: "📝", pointsLabel: "Key Points",    itemsLabel: "Action Items",          pointsIcon: "🔑", itemsIcon: "✅" },
  meeting:    { label: "Meeting",    icon: "📋", pointsLabel: "Key Decisions", itemsLabel: "Follow-up Tasks",       pointsIcon: "🎯", itemsIcon: "📌" },
  brainstorm: { label: "Brainstorm", icon: "💡", pointsLabel: "Core Concepts", itemsLabel: "Next Steps to Explore", pointsIcon: "🧠", itemsIcon: "🚀" },
  study:      { label: "Study",      icon: "📚", pointsLabel: "Key Facts",     itemsLabel: "Topics to Review",      pointsIcon: "📖", itemsIcon: "🔁" },
};

const CATEGORIES = [
  { key: "general", label: "General", color: "#64748b", emoji: "📝" },
  { key: "meeting", label: "Meeting", color: "#3b82f6", emoji: "📋" },
  { key: "idea",    label: "Idea",    color: "#f59e0b", emoji: "💡" },
  { key: "study",   label: "Study",   color: "#22c55e", emoji: "📚" },
  { key: "task",    label: "Task",    color: "#8b5cf6", emoji: "✅" },
];

const STAGE_LABELS = {
  uploading:   "Uploading audio...",
  transcribing: "Transcribing...",
  summarizing: "Summarizing...",
};

const STAGE_STEPS = [
  { key: "uploading",   label: "Upload" },
  { key: "transcribing", label: "Transcribe" },
  { key: "summarizing", label: "Summarize" },
];

function wordCount(text) {
  if (!text?.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function App() {
  // Core state
  const [isRecording, setIsRecording]       = useState(false);
  const [audioBlob, setAudioBlob]           = useState(null);
  const [audioFileName, setAudioFileName]   = useState("note.webm");
  const [audioSource, setAudioSource]       = useState(null);
  const [transcript, setTranscript]         = useState("");
  const [summary, setSummary]               = useState(null);
  const [stage, setStage]                   = useState(null);
  const [activeNoteId, setActiveNoteId]     = useState(null);
  const [liveStream, setLiveStream]         = useState(null);

  // Mode & category
  const [mode, setMode]             = useState("general");
  const [activeCategory, setActiveCategory] = useState(null); // null = selected note's category

  // Sidebar state
  const [searchQuery, setSearchQuery]   = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Processing flags
  const [resummarizing, setResummarizing]     = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedSummary, setCopiedSummary]     = useState(false);

  // Checked action items for current view (synced to activeNoteId)
  const [checkedItems, setCheckedItems] = useState([]);

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const fileInputRef     = useRef(null);
  const pollTokenRef     = useRef(null);

  const { notes, saveNote, updateNote, deleteNote } = useNotes();

  const isProcessing = stage !== null;
  const modeInfo = MODE_CONFIG[mode] || MODE_CONFIG.general;

  // Memoize audio URL to avoid memory leaks
  const audioUrl = useMemo(
    () => (audioBlob ? URL.createObjectURL(audioBlob) : null),
    [audioBlob]
  );
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Filtered + sorted note list for sidebar
  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return notes
      .filter((n) => {
        if (categoryFilter !== "all" && n.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          n.title?.toLowerCase().includes(q) ||
          n.transcript?.toLowerCase().includes(q) ||
          n.summary?.key_points?.join(" ").toLowerCase().includes(q) ||
          n.summary?.action_items?.join(" ").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [notes, searchQuery, categoryFilter]);

  const cancelPolling = useCallback(() => {
    if (pollTokenRef.current) pollTokenRef.current.cancelled = true;
    setStage(null);
  }, []);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) { alert("Please select an audio file."); return; }

    cancelPolling();
    setTranscript(""); setSummary(null); setCheckedItems([]);
    setAudioBlob(file); setAudioFileName(file.name); setAudioSource("upload");
    event.target.value = "";
  };

  const startRecording = async () => {
    cancelPolling();
    setTranscript(""); setSummary(null); setAudioBlob(null); setCheckedItems([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob); setAudioFileName("note.webm"); setAudioSource("recording");
      };
      mediaRecorder.start();
      setIsRecording(true); setLiveStream(stream);
    } catch (err) {
      console.error(err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false); setLiveStream(null);
    }
  };

  const handleSubmit = async () => {
    if (!audioBlob) { alert("Please record a voice note first."); return; }

    if (pollTokenRef.current) pollTokenRef.current.cancelled = true;
    const pollToken = { cancelled: false };
    pollTokenRef.current = pollToken;

    setTranscript(""); setSummary(null); setCheckedItems([]); setStage("uploading");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, audioFileName);
      formData.append("mode", mode);

      const uploadRes = await fetch(`${API_BASE}/api/jobs`, { method: "POST", body: formData });
      const { jobId, error: uploadError } = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadError || "Upload failed");

      setStage("transcribing");

      for (let attempt = 0; attempt < 150; attempt++) {
        if (pollToken.cancelled) return;
        await new Promise((r) => setTimeout(r, 1200));
        if (pollToken.cancelled) return;

        const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
        const job = await res.json();
        if (pollToken.cancelled) return;

        if (job.status === "summarizing") {
          setStage("summarizing");
        } else if (job.status === "done") {
          setTranscript(job.transcript);
          setSummary(job.summary);
          setStage(null);

          const note = saveNote({
            transcript: job.transcript,
            summary: job.summary,
            audioFileName,
            mode: job.mode || mode,
            category: job.mode || mode === "general" ? "general" : job.mode,
          });
          setActiveNoteId(note.id);
          setActiveCategory(note.category);
          setCheckedItems([]);
          return;
        } else if (job.status === "error") {
          throw new Error(typeof job.error === "string" ? job.error : "Processing failed");
        }
      }
      throw new Error("Timed out waiting for processing");
    } catch (err) {
      console.error(err);
      alert("Failed to process audio.");
      setStage(null);
    }
  };

  const handleResummarize = async () => {
    if (!transcript.trim()) return;
    setResummarizing(true);
    try {
      const res = await fetch(`${API_BASE}/api/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to summarize");

      setSummary(data.summary);
      setCheckedItems([]);
      if (activeNoteId) {
        updateNote(activeNoteId, {
          transcript,
          summary: data.summary,
          title: makeTitle(transcript, data.summary),
          mode,
          checkedItems: [],
        });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to re-summarize transcript.");
    } finally {
      setResummarizing(false);
    }
  };

  const selectNote = (note) => {
    cancelPolling();
    setAudioBlob(null); setAudioSource(null);
    setTranscript(note.transcript);
    setSummary(note.summary);
    setActiveNoteId(note.id);
    setMode(note.mode || "general");
    setActiveCategory(note.category || "general");
    setCheckedItems(note.checkedItems || []);
  };

  const startNewNote = useCallback(() => {
    cancelPolling();
    setAudioBlob(null); setAudioSource(null);
    setTranscript(""); setSummary(null);
    setActiveNoteId(null); setActiveCategory(null); setCheckedItems([]);
  }, [cancelPolling]);

  const handleDeleteNote = (id) => {
    deleteNote(id);
    if (id === activeNoteId) startNewNote();
  };

  const handleTogglePin = (e, note) => {
    e.stopPropagation();
    updateNote(note.id, { pinned: !note.pinned });
  };

  const handleSetCategory = (cat) => {
    setActiveCategory(cat);
    if (activeNoteId) updateNote(activeNoteId, { category: cat });
  };

  const handleCheckItem = (idx) => {
    const next = checkedItems.includes(idx)
      ? checkedItems.filter((i) => i !== idx)
      : [...checkedItems, idx];
    setCheckedItems(next);
    if (activeNoteId) updateNote(activeNoteId, { checkedItems: next });
  };

  const speakSummary = () => {
    if (!summary) return;
    const pts = (summary.key_points || []).map((p, i) => `${modeInfo.pointsLabel} ${i + 1}: ${p}`).join(". ");
    const acts = (summary.action_items || []).map((a, i) => `${modeInfo.itemsLabel} ${i + 1}: ${a}`).join(". ");
    const text = [pts && `Here are the ${modeInfo.pointsLabel}. ${pts}.`, acts && `Here are the ${modeInfo.itemsLabel}. ${acts}.`].filter(Boolean).join(" ");
    if (!text) return;
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };

  const copyToClipboard = async (text, setFlag) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFlag(true);
      setTimeout(() => setFlag(false), 1500);
    } catch { alert("Could not copy to clipboard."); }
  };

  const summaryAsText = () => {
    if (!summary) return "";
    const pts = (summary.key_points || []).map((p) => `- ${p}`).join("\n");
    const acts = (summary.action_items || []).map((a) => `- ${a}`).join("\n");
    return `${modeInfo.pointsLabel}:\n${pts}\n\n${modeInfo.itemsLabel}:\n${acts}`;
  };

  const exportMarkdown = () => {
    const note = notes.find((n) => n.id === activeNoteId);
    const title = note?.title || makeTitle(transcript, summary);
    const pts = (summary?.key_points || []).map((p) => `- ${p}`).join("\n");
    const acts = (summary?.action_items || []).map((a) => `- ${a}`).join("\n");
    const md = `# ${title}\n\n> Mode: ${modeInfo.label}\n\n## Transcript\n\n${transcript}\n\n## ${modeInfo.pointsLabel}\n\n${pts || "_None_"}\n\n## ${modeInfo.itemsLabel}\n\n${acts || "_None_"}\n`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "").slice(0, 50);
    a.download = `${slug || "voice-note"}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const txWordCount = wordCount(transcript);
  const doneCount = (summary?.action_items || []).filter((_, i) => checkedItems.includes(i)).length;
  const totalCount = (summary?.action_items || []).length;
  const activeCategoryInfo = CATEGORIES.find((c) => c.key === (activeCategory || "general")) || CATEGORIES[0];

  return (
    <div className="app-root">
      <div className="app-shell">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2 className="sidebar-title">Notes</h2>
            <button className="btn btn-ghost btn-sm" onClick={startNewNote}>+ New</button>
          </div>

          <div className="sidebar-search-wrap">
            <input
              className="sidebar-search"
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="sidebar-search-clear" onClick={() => setSearchQuery("")}>×</button>
            )}
          </div>

          <div className="category-chips">
            <button
              className={`cat-chip ${categoryFilter === "all" ? "cat-chip-active" : ""}`}
              onClick={() => setCategoryFilter("all")}
            >All</button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={`cat-chip ${categoryFilter === c.key ? "cat-chip-active" : ""}`}
                style={categoryFilter === c.key ? { background: c.color, color: "#fff", borderColor: c.color } : {}}
                onClick={() => setCategoryFilter(c.key)}
              >{c.emoji}</button>
            ))}
          </div>

          <div className="note-list">
            {filteredNotes.length === 0 && (
              <div className="note-empty">
                <div className="note-empty-icon">🎙️</div>
                {searchQuery || categoryFilter !== "all"
                  ? "No notes match your search."
                  : "No notes yet.\nRecord something to get started."}
              </div>
            )}

            {filteredNotes.map((note) => {
              const catInfo = CATEGORIES.find((c) => c.key === note.category) || CATEGORIES[0];
              const wc = wordCount(note.transcript);
              return (
                <div
                  key={note.id}
                  className={`note-item ${note.id === activeNoteId ? "note-item-active" : ""} ${note.pinned ? "note-item-pinned" : ""}`}
                  style={{ "--cat-color": catInfo.color }}
                  onClick={() => selectNote(note)}
                >
                  <div className="note-item-actions">
                    <button
                      className={`note-pin ${note.pinned ? "note-pin-active" : ""}`}
                      title={note.pinned ? "Unpin" : "Pin to top"}
                      onClick={(e) => handleTogglePin(e, note)}
                    >📌</button>
                    <button
                      className="note-delete"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                    >×</button>
                  </div>
                  <div className="note-item-top">
                    <span className="note-cat-dot" style={{ background: catInfo.color }}>{catInfo.emoji}</span>
                    <span className="note-mode-tag">{MODE_CONFIG[note.mode || "general"]?.icon}</span>
                  </div>
                  <div className="note-item-title">{note.title}</div>
                  <div className="note-item-meta">
                    <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                    {wc > 0 && <span>{wc} words</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── Main card ── */}
        <div className="app-card">
          <div className="app-header">
            <h1 className="app-title">AI Voice Note Summarizer</h1>
            <p className="app-subtitle">Record a voice note — get smart summaries, decisions, or study guides in seconds.</p>
          </div>

          {/* Mode selector */}
          <div className="mode-tabs">
            {Object.entries(MODE_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                className={`mode-tab ${mode === key ? "mode-tab-active" : ""}`}
                onClick={() => setMode(key)}
                disabled={isProcessing}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
            ))}
          </div>

          <div className="app-top-row">
            {/* Left: record */}
            <div className="block">
              <div className="block-header">
                <h2 className="block-title">Record</h2>
              </div>

              <div className="btn-row">
                {!isRecording ? (
                  <button className="btn btn-primary" onClick={startRecording}>
                    <span className="btn-icon">●</span> Start Recording
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={stopRecording}>
                    <span className="btn-icon">■</span> Stop Recording
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={isRecording}>
                  <span className="btn-icon">⬆</span> Upload File
                </button>
                <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} style={{ display: "none" }} />
                <button className="btn btn-secondary" onClick={handleSubmit} disabled={isProcessing || !audioBlob}>
                  {isProcessing ? STAGE_LABELS[stage] : `${modeInfo.icon} Transcribe & Summarize`}
                </button>
              </div>

              {isProcessing && (
                <div className="progress-steps">
                  {STAGE_STEPS.map((step, idx) => {
                    const currentIdx = STAGE_STEPS.findIndex((s) => s.key === stage);
                    const status = idx < currentIdx ? "done" : idx === currentIdx ? "active" : "pending";
                    return (
                      <div key={step.key} className={`progress-step progress-step-${status}`}>
                        <span className="progress-step-dot">{status === "done" ? "✓" : idx + 1}</span>
                        <span className="progress-step-label">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {isRecording ? (
                <div className="audio-preview">
                  <p className="audio-preview-label">Listening...</p>
                  <Waveform stream={liveStream} />
                </div>
              ) : (
                <div className="audio-preview">
                  <p className="audio-preview-label">
                    {audioBlob
                      ? audioSource === "upload" ? `Uploaded: ${audioFileName}` : "Preview your recording:"
                      : "No audio yet. Record or upload a file."}
                  </p>
                  {audioBlob && <audio controls src={audioUrl} />}
                </div>
              )}
            </div>

            {/* Right: transcript */}
            <div className="block">
              <div className="block-header">
                <h2 className="block-title">
                  Transcript
                  {txWordCount > 0 && <span className="word-count-badge">{txWordCount} words</span>}
                </h2>
              </div>
              <textarea
                className="transcript-box transcript-editable"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Your transcript will appear here after processing. Fix any mistakes, then re-summarize."
              />
              {transcript && (
                <div className="btn-row" style={{ marginTop: 8, marginBottom: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={handleResummarize} disabled={resummarizing}>
                    {resummarizing ? "Re-summarizing..." : "↻ Re-summarize"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(transcript, setCopiedTranscript)}>
                    {copiedTranscript ? "✓ Copied" : "📋 Copy"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Summary section */}
          {summary && (
            <div className="summary-box">
              <div className="summary-heading">
                <div className="summary-heading-left">
                  <h2>{modeInfo.icon} Summary</h2>
                  <span className="summary-mode-badge">{modeInfo.label} mode</span>
                </div>
                <div className="summary-heading-right">
                  {/* Category picker */}
                  <div className="category-picker">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        className={`cat-pill ${activeCategory === c.key ? "cat-pill-active" : ""}`}
                        style={activeCategory === c.key ? { background: c.color, borderColor: c.color } : {}}
                        title={c.label}
                        onClick={() => handleSetCategory(c.key)}
                      >{c.emoji}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="btn-row" style={{ marginBottom: 14 }}>
                <button className="btn btn-ghost" onClick={speakSummary}>🔊 Play</button>
                <button className="btn btn-ghost" onClick={() => copyToClipboard(summaryAsText(), setCopiedSummary)}>
                  {copiedSummary ? "✓ Copied" : "📋 Copy"}
                </button>
                <button className="btn btn-ghost" onClick={exportMarkdown}>⬇ Export .md</button>
              </div>

              <div className="summary-columns">
                <div>
                  <div className="summary-column-title">
                    {modeInfo.pointsIcon} {modeInfo.pointsLabel}
                  </div>
                  <ul className="summary-list">
                    {summary.key_points?.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="summary-column-title">
                    {modeInfo.itemsIcon} {modeInfo.itemsLabel}
                    {totalCount > 0 && (
                      <span className="action-progress">{doneCount}/{totalCount} done</span>
                    )}
                  </div>
                  <ul className="summary-list action-list">
                    {summary.action_items?.map((a, idx) => (
                      <li key={idx} className={`action-item ${checkedItems.includes(idx) ? "action-item-done" : ""}`}>
                        <input
                          type="checkbox"
                          className="action-checkbox"
                          checked={checkedItems.includes(idx)}
                          onChange={() => handleCheckItem(idx)}
                        />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {activeCategory && (
                <div className="summary-category-tag" style={{ borderColor: activeCategoryInfo.color, color: activeCategoryInfo.color }}>
                  {activeCategoryInfo.emoji} {activeCategoryInfo.label}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
