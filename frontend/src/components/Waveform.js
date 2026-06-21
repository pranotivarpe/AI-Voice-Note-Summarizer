// Waveform.js
// Draws a live waveform from a MediaStream using the Web Audio API.

import React, { useRef, useEffect } from "react";

function Waveform({ stream }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!stream) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationFrameId;

    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "#60a5fa";
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [stream]);

  return <canvas ref={canvasRef} className="waveform-canvas" />;
}

export default Waveform;
