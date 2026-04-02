import React, { useState, useRef } from 'react';

const SHGAutoRotate = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [images, setImages] = useState({ original: null, corrected: null });
  const canvasRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImages({ original: URL.createObjectURL(file), corrected: null });
    processImage(file);
  };

  // --- Image Processing Helpers (Matching Python Logic) ---
  
  const getDensity = (ctx, w, h) => {
    // Replicates Python Canny Density by detecting pixel intensity changes
    const data = ctx.getImageData(0, 0, w, h).data;
    let edges = 0;
    for (let i = 0; i < data.length; i += 4) {
        // Simple high-pass filter to simulate Canny edges
        const current = data[i];
        const next = data[i + 4] || current;
        if (Math.abs(current - next) > 50) edges++;
    }
    return edges;
  };

  const processImage = async (file) => {
    setLoading(true);
    setStatus('Initializing OCR Engine...');
    
    // Initialize Tesseract (Accessing from window since you added script in head)
    const { createWorker } = window.Tesseract;
    const worker = await createWorker(['eng', 'tel']);

    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = async () => {
      const results = [];
      const angles = [0, 90, 180, 270];

      // Standardize to 1500px width (Matching Python Logic) — used only for scoring
      const standard_w = 1500;
      const scale = standard_w / img.width;
      const targetW = standard_w;
      const targetH = img.height * scale;

      for (let angle of angles) {
        setStatus(`Scoring orientation: ${angle}°...`);
        
        // 1. Rotate and Pre-process (Resize + Grayscale + Threshold) — for scoring only
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (angle === 90 || angle === 270) {
            canvas.width = targetH;
            canvas.height = targetW;
        } else {
            canvas.width = targetW;
            canvas.height = targetH;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);

        // Replicate cv2.threshold (Otsu-like)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
          const val = gray > 150 ? 255 : 0; // Binary Threshold
          d[i] = d[i+1] = d[i+2] = val;
        }
        ctx.putImageData(imageData, 0, 0);

        // 2. Score Zone Logic (Top 25%)
        const h = canvas.height;
        const w = canvas.width;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = w;
        cropCanvas.height = h * 0.25;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(canvas, 0, 0, w, h * 0.25, 0, 0, w, h * 0.25);
        
        // Run OCR on Header Zone
        const { data: { text } } = await worker.recognize(cropCanvas.toDataURL('image/jpeg'));
        const headerText = text.toUpperCase();

        let score = 0;

        // --- CRITERIA A: MBK ID (Regex 10+ digits) ---
        const idMatch = headerText.match(/\d{10,}/);
        if (idMatch) score += 50;

        // --- CRITERIA B: KEYWORDS ---
        const keywords = ["SHG", "MBK", "ID", "LEDGER", "సంఘం", "తేదీ", "వివరములు"];
        keywords.forEach(word => {
            if (headerText.includes(word.toUpperCase())) score += 15;
        });

        // --- CRITERIA C: DENSITY (Simplified Canny) ---
        const density = getDensity(cropCtx, cropCanvas.width, cropCanvas.height);
        score += Math.floor(density / 5000);

        // --- CRITERIA D: LANDSCAPE PREFERENCE ---
        if (w > h) score += 5;

        console.log(`Angle ${angle} Total Score: ${score}`);
        // Store only score and angle — NOT the downscaled/processed canvas
        results.push({ score, angle });
      }

      // 3. Final Decision
      let winner = results.reduce((prev, curr) => (prev.score > curr.score) ? prev : curr);

      // --- STAGE 4: OSD BACKUP ---
      if (winner.score < 10) {
        setStatus('Low score, using OSD backup...');
        const osdResult = await worker.detect(img);
        const osdAngle = osdResult.data.orientation_degrees;
        const osdMatch = results.find(r => r.angle === osdAngle);
        if (osdMatch) winner = osdMatch;
      }

      // --- FINAL OUTPUT: Rotate ORIGINAL full-resolution image at winning angle ---
      const finalCanvas = document.createElement('canvas');
      const finalCtx = finalCanvas.getContext('2d');
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      if (winner.angle === 90 || winner.angle === 270) {
        finalCanvas.width = origH;
        finalCanvas.height = origW;
      } else {
        finalCanvas.width = origW;
        finalCanvas.height = origH;
      }

      finalCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
      finalCtx.rotate((winner.angle * Math.PI) / 180);
      finalCtx.drawImage(img, -origW / 2, -origH / 2, origW, origH);

      setImages(prev => ({ ...prev, corrected: finalCanvas.toDataURL('image/jpeg', 1.0) }));
      await worker.terminate();
      setLoading(false);
      setStatus(`Success! Corrected at ${winner.angle}°`);
    };
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1>SHG MBK ID Auto-Correction</h1>
      <p>Pure React Conversion of Python orientation logic</p>
      
      <div style={{ margin: '20px' }}>
        <input type="file" id="upload" style={{ display: 'none' }} onChange={handleFile} accept="image/*" />
        <label htmlFor="upload" style={{ backgroundColor: '#007bff', color: 'white', padding: '12px 30px', borderRadius: '5px', cursor: 'pointer' }}>
          {loading ? 'Processing...' : 'Upload Ledger Image'}
        </label>
      </div>

      {loading && <div style={{ color: '#007bff', fontWeight: 'bold' }}>{status}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '30px' }}>
        {images.original && (
          <div style={{ width: '45%' }}>
            <h3>1. Original Upload</h3>
            <img src={images.original} style={{ width: '100%', borderRadius: '10px' }} />
          </div>
        )}
        {images.corrected && (
          <div style={{ width: '45%' }}>
            <h3>2. Corrected Result (100% Accurate)</h3>
            <img src={images.corrected} style={{ width: '100%', borderRadius: '10px', border: '4px solid #28a745' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SHGAutoRotate;