'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import axios from 'axios';

export function VideoUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [gradePreset, setGradePreset] = useState('cinema-log-to-rec709');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user.id) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', sessionData.session.user.id);

      const response = await axios.post('/api/upload', formData);
      setVideoId(response.data.videoId);
      alert('✅ Video uploaded! Ready to process.');
    } catch (error: any) {
      const errorMsg = `Upload failed: ${error.message}`;
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!videoId) return;

    setProcessing(true);
    setError(null);
    try {
      const response = await axios.post('/api/process', {
        videoId,
        gradePreset,
      });
      setResult(response.data);
      alert('✅ Video processed! Download ready.');
    } catch (error: any) {
      const errorMsg = `Processing failed: ${error.message}`;
      setError(errorMsg);
      alert(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl border border-gray-700">
      <h1 className="text-4xl font-bold text-white mb-2">Cinematic Studio</h1>
      <p className="text-gray-400 mb-8">Upload videos. Apply professional color grading. Download cinema-quality output.</p>

      {/* Upload Section */}
      <form onSubmit={handleUpload} className="mb-8 p-6 bg-gray-800 rounded-lg border-2 border-dashed border-gray-600">
        <input
          type="file"
          accept="video/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setError(null);
          }}
          className="mb-4 block w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        />
        {file && <p className="text-sm text-gray-300 mb-4">Selected: {file.name}</p>}
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition"
        >
          {uploading ? '⏳ Uploading...' : '📤 Upload Video'}
        </button>
      </form>

      {/* Processing Section */}
      {videoId && (
        <div className="mb-8 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Apply Grade Preset</h2>
          <select
            value={gradePreset}
            onChange={(e) => setGradePreset(e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg mb-4 border border-gray-600 focus:border-blue-500 focus:outline-none"
          >
            <option value="cinema-log-to-rec709">🎬 Cinema Log to Rec.709</option>
            <option value="teal-orange">🌊 Teal & Orange</option>
            <option value="kodak-2383">📽️ Kodak 2383 Film</option>
            <option value="noir">🖤 Film Noir</option>
          </select>

          <button
            onClick={handleProcess}
            disabled={processing}
            className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition"
          >
            {processing ? '⏳ Processing...' : '✨ Apply Grade & Process'}
          </button>
        </div>
      )}

      {/* Result Section */}
      {result && (
        <div className="p-6 bg-green-900/30 border border-green-700 rounded-lg">
          <h3 className="text-lg font-semibold text-green-400 mb-2">✅ Processing Complete!</h3>
          <p className="text-green-300 mb-4">Your cinematic video is ready to download.</p>
          <p className="text-sm text-gray-300">File: {result.processedUrl}</p>
        </div>
      )}

      {/* Error Section */}
      {error && (
        <div className="p-6 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}
    </div>
  );
}
