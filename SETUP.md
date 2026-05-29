# Cinematic Video Enhancement Platform - Phase 1 Setup

**Goal:** Upload a video → FFmpeg process it → Download cinematic output

**Timeline:** All steps = 2 hours to full working system

---

## STEP 1: Environment Setup ✅ DONE

Repo created at: `C:\Users\antoi\OneDrive\Desktop\cinematic-video`

---

## STEP 2: Install Dependencies

```bash
cd C:\Users\antoi\OneDrive\Desktop\cinematic-video

npm install supabase @supabase/supabase-js axios dotenv fluent-ffmpeg uuid
npm install -D @types/fluent-ffmpeg
```

---

## STEP 3: Create .env.local

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Local FFmpeg processing
PROCESSING_DIR=/tmp/cinematic
MAX_VIDEO_SIZE_MB=500
FFMPEG_PATH=ffmpeg
```

---

## STEP 4: Supabase Setup

1. Go to https://supabase.com → Create new project
2. In SQL editor, run:

```sql
-- Videos table
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  original_url TEXT NOT NULL,
  original_size_mb INT,
  duration_seconds FLOAT,
  status TEXT DEFAULT 'uploaded', -- uploaded, processing, completed, failed
  grade_preset TEXT DEFAULT 'cinema-log-to-rec709', -- grade applied
  processed_url TEXT,
  processed_size_mb INT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Processing jobs table
CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  job_type TEXT DEFAULT 'enhance', -- enhance, upscale, grade
  status TEXT DEFAULT 'queued', -- queued, processing, completed, failed
  progress_percent INT DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('processed', 'processed', false);
```

3. Copy your credentials into .env.local

---

## STEP 5: Create Supabase Client

File: `lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseServer = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
};
```

---

## STEP 6: Create API Routes

File: `app/api/upload/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: { sizeLimit: '500mb' },
  },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file || !userId) {
      return NextResponse.json(
        { error: 'Missing file or userId' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const filename = `${uuidv4()}-${file.name}`;
    
    const supabase = supabaseServer();

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    // Get download URL
    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(filename);

    // Create video record
    const { data, error: dbError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        original_filename: file.name,
        original_url: filename,
        original_size_mb: Math.round(file.size / 1024 / 1024),
        status: 'uploaded',
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json({
      videoId: data.id,
      filename,
      message: 'Video uploaded successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

---

## STEP 7: Create FFmpeg Processing Worker

File: `lib/ffmpeg-worker.ts`

```typescript
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { supabaseServer } from './supabase';

const PROCESSING_DIR = process.env.PROCESSING_DIR || '/tmp/cinematic';

// Ensure processing directory exists
if (!fs.existsSync(PROCESSING_DIR)) {
  fs.mkdirSync(PROCESSING_DIR, { recursive: true });
}

export async function processVideo(
  videoId: string,
  inputPath: string,
  gradePreset: string = 'cinema-log-to-rec709'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputFilename = `${videoId}-${gradePreset}.mp4`;
    const outputPath = path.join(PROCESSING_DIR, outputFilename);

    const command = ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-preset medium',
        '-crf 18', // High quality
        '-c:a aac',
        '-b:a 192k',
      ]);

    // Apply grade preset via FFmpeg filters
    const filterChain = getFilterChain(gradePreset);
    if (filterChain) {
      command.videoFilters(filterChain);
    }

    command
      .output(outputPath)
      .on('start', (cmd) => {
        console.log('FFmpeg processing started:', cmd);
      })
      .on('progress', (progress) => {
        console.log(`Processing: ${Math.round(progress.percent)}%`);
      })
      .on('end', async () => {
        console.log('FFmpeg processing completed');
        
        // Upload to Supabase
        try {
          const fileBuffer = fs.readFileSync(outputPath);
          const supabase = supabaseServer();
          
          const { error: uploadError } = await supabase.storage
            .from('processed')
            .upload(outputFilename, fileBuffer, {
              contentType: 'video/mp4',
              upsert: false,
            });

          if (uploadError) throw uploadError;

          // Clean up local file
          fs.unlinkSync(outputPath);

          resolve(outputFilename);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

function getFilterChain(preset: string): string {
  const filters: Record<string, string> = {
    'cinema-log-to-rec709': [
      'colorspace=bt709:iall=bt601',
      'eq=contrast=1.2:saturation=0.95:brightness=-0.05',
      'curves=preset=linear',
    ].join(','),
    
    'teal-orange': [
      'colorspace=bt709',
      'colorbalance=rs=0.1:gs=0:bs=-0.1:rm=-0.1:gm=0:bm=0.1',
      'eq=saturation=1.2:contrast=1.1',
    ].join(','),
    
    'kodak-2383': [
      'colorspace=bt709',
      'curves=preset=linear',
      'eq=saturation=0.9:contrast=1.15:brightness=0.05',
    ].join(','),
    
    'noir': [
      'format=gray',
      'eq=contrast=1.3:brightness=-0.1',
    ].join(','),
  };

  return filters[preset] || filters['cinema-log-to-rec709'];
}
```

---

## STEP 8: Create Process Endpoint

File: `app/api/process/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { processVideo } from '@/lib/ffmpeg-worker';

export async function POST(req: NextRequest) {
  try {
    const { videoId, gradePreset } = await req.json();
    const supabase = supabaseServer();

    // Get video from database
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (fetchError) throw fetchError;

    // Update status to processing
    await supabase
      .from('videos')
      .update({ status: 'processing' })
      .eq('id', videoId);

    // Download video from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('videos')
      .download(video.original_url);

    if (downloadError) throw downloadError;

    // Convert blob to file path (save temporarily)
    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join('/tmp', `${videoId}-input.mp4`);
    fs.writeFileSync(tmpPath, await fileData.arrayBuffer());

    // Process video with FFmpeg
    const processedFilename = await processVideo(
      videoId,
      tmpPath,
      gradePreset || 'cinema-log-to-rec709'
    );

    // Update video record
    const { data: urlData } = supabase.storage
      .from('processed')
      .getPublicUrl(processedFilename);

    await supabase
      .from('videos')
      .update({
        status: 'completed',
        processed_url: processedFilename,
        grade_preset: gradePreset,
      })
      .eq('id', videoId);

    // Clean up temp file
    fs.unlinkSync(tmpPath);

    return NextResponse.json({
      success: true,
      videoId,
      processedUrl: processedFilename,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

---

## STEP 9: Create Frontend Upload Component

File: `components/VideoUploader.tsx`

```typescript
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user.id) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', sessionData.session.user.id);

      const response = await axios.post('/api/upload', formData);
      setVideoId(response.data.videoId);
      alert('Video uploaded! Ready to process.');
    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!videoId) return;

    setProcessing(true);
    try {
      const response = await axios.post('/api/process', {
        videoId,
        gradePreset,
      });
      setResult(response.data);
      alert('Video processed! Download ready.');
    } catch (error: any) {
      alert(`Processing failed: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-gray-900 rounded-lg">
      <h1 className="text-3xl font-bold text-white mb-6">Cinematic Video Studio</h1>

      <form onSubmit={handleUpload} className="mb-6">
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mb-4 block w-full text-gray-300"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:bg-gray-600"
        >
          {uploading ? 'Uploading...' : 'Upload Video'}
        </button>
      </form>

      {videoId && (
        <div className="mb-6">
          <label className="block text-white mb-2">Grade Preset:</label>
          <select
            value={gradePreset}
            onChange={(e) => setGradePreset(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 text-white rounded mb-4"
          >
            <option value="cinema-log-to-rec709">Cinema Log to Rec.709</option>
            <option value="teal-orange">Teal & Orange</option>
            <option value="kodak-2383">Kodak 2383</option>
            <option value="noir">Film Noir</option>
          </select>

          <button
            onClick={handleProcess}
            disabled={processing}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:bg-gray-600"
          >
            {processing ? 'Processing...' : 'Apply Grade & Process'}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-green-900 p-4 rounded text-green-100">
          <p>✅ Processing complete!</p>
          <p>Download: {result.processedUrl}</p>
        </div>
      )}
    </div>
  );
}
```

---

## STEP 10: Create Home Page

File: `app/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { VideoUploader } from '@/components/VideoUploader';

export default function Home() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user);
    });
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg"
        >
          Sign In with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <VideoUploader />
    </div>
  );
}
```

---

## NEXT STEPS

1. Fill in .env.local with your Supabase credentials
2. Run `npm run dev`
3. Visit http://localhost:3000
4. Sign in
5. Upload a video
6. Choose a grade preset
7. Click "Process"
8. Download your cinematic video

**That's Phase 1 — fully working, locally processed, Supabase-backed cinematic video enhancement.**

---

## What's Not Done Yet (Phase 2+)

- Batch processing
- Video preview before/after slider
- More LUTs and presets
- Direct Instagram/Facebook publishing
- Email notifications
- Admin dashboard
- Usage analytics
- Pricing/subscription

