/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Camera, RefreshCw, Download, AlertCircle, Loader2, Ghost, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize camera
  const startCamera = async () => {
    try {
      setError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Il tuo browser non supporta l'accesso alla fotocamera.");
      }

      // Check if any video devices exist
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoDevice = devices.some(device => device.kind === 'videoinput');
      
      if (!hasVideoDevice) {
        throw new Error("Nessuna fotocamera rilevata su questo dispositivo.");
      }

      let mediaStream: MediaStream;
      
      // Try sequence of constraints
      try {
        // 1. Try back camera
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
      } catch (e1) {
        try {
          // 2. Try front camera/any camera
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
          });
        } catch (e2) {
          // 3. Try most basic constraint
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
        }
      }
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      // We don't block the app, but we can show a hint
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message.includes('not found')) {
        console.warn("No camera device found.");
      } else {
        setError("Errore fotocamera: " + (err.message || "Permesso negato o dispositivo occupato."));
      }
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(dataUrl);
        // Stop stream to save battery/resources while editing
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setCapturedImage(dataUrl);
        stream?.getTracks().forEach(track => track.stop());
        setStream(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setProcessedImage(null);
    setError(null);
    startCamera();
  };

  const processImage = async () => {
    if (!capturedImage) return;

    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-2.5-flash-image";

      const base64Data = capturedImage.split(',')[1];
      
      const prompt = "Identify all human heads in this image and replace each one with a realistic monkey head. Ensure the monkey heads are properly scaled and oriented to match the original bodies.";

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: "image/jpeg",
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          setProcessedImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error("L'IA non ha restituito un'immagine. Riprova con una foto più chiara.");
      }

    } catch (err: any) {
      console.error("Processing error:", err);
      setError(err.message || "Si è verificato un errore durante l'elaborazione dell'immagine.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (!processedImage) return;
    const link = document.createElement('a');
    link.href = processedImage;
    link.download = `devolutore-${Date.now()}.jpg`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Ghost className="w-5 h-5 text-black" />
          </div>
          <h1 className="font-bold tracking-tight text-lg uppercase italic">Devolutore</h1>
        </div>
        {capturedImage && !isProcessing && (
          <button 
            onClick={reset}
            className="p-2 hover:bg-white/5 rounded-full transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </header>

      <main className="flex-1 relative flex flex-col items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {!capturedImage ? (
            <motion.div 
              key="camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md aspect-[3/4] bg-zinc-900 rounded-3xl overflow-hidden relative shadow-2xl border border-white/5"
            >
              {stream ? (
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center gap-4">
                  <Camera className="w-12 h-12 text-zinc-700" />
                  <p className="text-zinc-500 text-sm">Fotocamera non disponibile o permessi negati. Puoi comunque caricare una foto.</p>
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none border-[20px] border-black/20 rounded-3xl" />
              
              {/* Camera UI Overlay */}
              <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8 px-6">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-14 h-14 rounded-full bg-zinc-800/80 backdrop-blur-md flex items-center justify-center active:scale-95 transition-transform border border-white/10"
                >
                  <Upload className="w-6 h-6 text-white" />
                </button>

                {stream && (
                  <button 
                    onClick={capturePhoto}
                    className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center group active:scale-95 transition-transform"
                  >
                    <div className="w-16 h-16 bg-white rounded-full group-hover:scale-90 transition-transform" />
                  </button>
                )}

                <div className="w-14 h-14" /> {/* Spacer for balance if camera is off */}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileUpload}
              />
            </motion.div>
          ) : (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md flex flex-col gap-6"
            >
              <div className="aspect-[3/4] bg-zinc-900 rounded-3xl overflow-hidden relative shadow-2xl border border-white/5">
                <img 
                  src={processedImage || capturedImage} 
                  alt="Preview" 
                  className="w-full h-full object-cover"
                />
                
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
                    <p className="text-emerald-500 font-medium animate-pulse uppercase tracking-widest">Devoluzione in corso...</p>
                  </div>
                )}

                {error && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center gap-4">
                    <AlertCircle className="w-12 h-12 text-red-500" />
                    <p className="text-red-200 font-medium">{error}</p>
                    <button 
                      onClick={reset}
                      className="px-6 py-2 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition-colors"
                    >
                      Riprova
                    </button>
                  </div>
                )}
              </div>

              {!processedImage && !isProcessing && !error && (
                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                    <Ghost className="w-6 h-6 text-emerald-500" />
                    <span className="font-bold text-emerald-500 uppercase tracking-wider">Modalità Scimmia Attiva</span>
                  </div>

                  <button 
                    onClick={processImage}
                    className="w-full py-4 bg-emerald-500 text-black rounded-2xl font-bold text-lg shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                  >
                    Inizia Devoluzione
                  </button>
                </div>
              )}

              {processedImage && !isProcessing && (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={downloadImage}
                    className="flex-1 py-4 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <Download className="w-5 h-5" /> Salva
                  </button>
                  <button 
                    onClick={reset}
                    className="flex-1 py-4 bg-zinc-800 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <RefreshCw className="w-5 h-5" /> Nuova
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Footer Info */}
      <footer className="p-6 text-center">
        <p className="text-zinc-500 text-[10px] uppercase tracking-[0.2em] font-bold">
          Ritorna alle origini • Gemini AI
        </p>
      </footer>
    </div>
  );
}
