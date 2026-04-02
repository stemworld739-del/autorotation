import React, { useState } from 'react';

const SHGMBKFinal = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [images, setImages] = useState({ original: null, corrected: null });

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImages({ original: URL.createObjectURL(file), corrected: null });
    processImage(file);
  };

  const processImage = async (file) => {
    setLoading(true);
    setStatus('Initializing OCR Engine...');
    
    // 1. Create a persistent worker for both Telugu and English
    const worker = await window.Tesseract.createWorker(['eng', 'tel']);
    
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = async () => {
      try {
        const angles = [0, 90, 180, 270];
        const results = [];

        // Analysis Resolution - 1600px width (Matches Python Standard)
        const analysisWidth = 1600; 
        const scale = analysisWidth / img.naturalWidth;

        for (let angle of angles) {
          setStatus(`Analyzing ${angle}° orientation...`);
          
          // --- INTERNAL DETECTION (THE BRAIN) ---
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const w = analysisWidth;
          const h = img.naturalHeight * scale;

          if (angle === 90 || angle === 270) {
            canvas.width = h; canvas.height = w;
          } else {
            canvas.width = w; canvas.height = h;
          }

          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((angle * Math.PI) / 180);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);

          // REPLICATE PYTHON Thresholding (Otsu-style Binary)
          const cropH = Math.floor(canvas.height * 0.40); // Scan top 40%
          const imageData = ctx.getImageData(0, 0, canvas.width, cropH);
          const data = imageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
            // Binary threshold (Logic from Python cv2.threshold)
            const binary = gray > 140 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = binary;
          }

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = canvas.width;
          cropCanvas.height = cropH;
          cropCanvas.getContext('2d').putImageData(imageData, 0, 0);

          // Run OCR on the thresholded Header Zone
          const { data: { text } } = await worker.recognize(cropCanvas);
          const cleanText = text.toUpperCase();

          // SCORING (The Python Logic)
          let score = 0;
          
          // Criteria 1: The MBK ID (Match starting with 01200 or 0120)
          const mbkIdMatch = cleanText.match(/(01200|0120|0080|9010)\d+/);
          if (mbkIdMatch) score += 2000; 

          // Criteria 2: Header Keywords
          ["SHG", "MBK", "ID", "సంఘం", "తేదీ", "వివరములు", "ఆర్ధిక"].forEach(key => {
            if (cleanText.includes(key.toUpperCase())) score += 100;
          });

          // Criteria 3: Form Geometry (Landscape preference)
          if (canvas.width > canvas.height) score += 50;

          console.log(`Angle ${angle} Total Score: ${score}`);
          results.push({ score, angle });
        }

        // --- FINAL DECISION ---
        const winner = results.sort((a, b) => b.score - a.score)[0];

        // --- OUTPUT (THE EYES): High-Quality Rotation ---
        setStatus('Finalizing High Quality Image...');
        const outCanvas = document.createElement('canvas');
        const outCtx = outCanvas.getContext('2d');

        // Use natural resolution for 100% quality
        if (winner.angle === 90 || winner.angle === 270) {
          outCanvas.width = img.naturalHeight;
          outCanvas.height = img.naturalWidth;
        } else {
          outCanvas.width = img.naturalWidth;
          outCanvas.height = img.naturalHeight;
        }

        outCtx.translate(outCanvas.width / 2, outCanvas.height / 2);
        outCtx.rotate((winner.angle * Math.PI) / 180);
        // Draw ORIGINAL image without any thresholding
        outCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

        setImages(prev => ({ 
          ...prev, 
          corrected: outCanvas.toDataURL('image/png') 
        }));

      } catch (err) {
        console.error("Processing Error:", err);
        setStatus('Processing Failed. Try a clearer image.');
      } finally {
        await worker.terminate();
        setLoading(false);
      }
    };
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>SHG MBK ID Auto-Correction (Client-Side)</h1>
      <p>100% Quality Output | Form-Aware Rotation</p>
      
      <div style={{ margin: '20px' }}>
        <input type="file" id="up" style={{ display: 'none' }} onChange={handleFile} accept="image/*" />
        <label htmlFor="up" style={{ background: '#007bff', color: 'white', padding: '15px 35px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          {loading ? 'Processing...' : 'Upload Ledger Image'}
        </label>
      </div>

      {loading && <div style={{ color: '#d9534f', margin: '20px', fontWeight: 'bold' }}>{status}</div>}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
        {images.original && (
          <div style={{ width: '45%' }}>
            <h4>Original</h4>
            <img src={images.original} style={{ width: '100%', border: '1px solid #ccc' }} />
          </div>
        )}
        {images.corrected && (
          <div style={{ width: '45%' }}>
            <h4>Corrected (Full Quality)</h4>
            <img src={images.corrected} style={{ width: '100%', border: '2px solid green' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SHGMBKFinal;