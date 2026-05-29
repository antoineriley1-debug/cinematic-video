# 🚀 Cinematic Video Studio - Quick Start

## Prerequisites
- Node.js 18+
- FFmpeg installed (`ffmpeg --version` to verify)
- Supabase account (free tier works)
- GitHub account (for OAuth)

---

## 5-Minute Setup

### 1. Create Supabase Project
```
Go to https://supabase.com
Click "New Project"
Keep name simple: "cinematic-video"
Copy your API URL and keys
```

### 2. Copy .env File
```bash
cd C:\Users\antoi\OneDrive\Desktop\cinematic-video
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 3. Set Up Supabase Database

Go to Supabase Dashboard → SQL Editor → New Query → Paste this:

```sql
-- Create tables
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  original_url TEXT NOT NULL,
  original_size_mb INT,
  duration_seconds FLOAT,
  status TEXT DEFAULT 'uploaded',
  grade_preset TEXT DEFAULT 'cinema-log-to-rec709',
  processed_url TEXT,
  processed_size_mb INT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  job_type TEXT DEFAULT 'enhance',
  status TEXT DEFAULT 'queued',
  progress_percent INT DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('processed', 'processed', false);

-- Set up RLS policies
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own videos"
ON videos FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create videos"
ON videos FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their videos"
ON videos FOR UPDATE
USING (auth.uid() = user_id);
```

Run it!

### 4. Install Dependencies
```bash
npm install
```

### 5. Run Dev Server
```bash
npm run dev
```

Visit: http://localhost:3000

### 6. Test It
1. Sign in with GitHub
2. Upload a video file
3. Choose a grade preset
4. Click "Apply Grade & Process"
5. Wait for processing
6. Download your cinematic video!

---

## Troubleshooting

### "FFmpeg not found"
```bash
# Install FFmpeg
# Windows (with chocolatey):
choco install ffmpeg

# Or download: https://ffmpeg.org/download.html
# Add to PATH
```

### "Storage bucket error"
Make sure you created the `videos` and `processed` buckets in Supabase Storage tab.

### "Auth not working"
1. Go to Supabase Dashboard
2. Authentication → Providers → GitHub
3. Enable it
4. Get Client ID and Secret from your GitHub OAuth App
5. Add to Supabase

### "Processing hangs"
Check that FFmpeg is installed and accessible:
```bash
which ffmpeg
ffmpeg -version
```

---

## Next Steps (Phase 2)

Once Phase 1 is working:

1. **Add batch processing**
   - Queue multiple videos
   - Process in background

2. **Before/After slider**
   - Show original vs graded

3. **More grade presets**
   - Add 10+ professional LUTs
   - Custom LUT upload

4. **Instagram publishing**
   - Direct post to Reels
   - Hashtag suggestions

5. **Video preview**
   - Upload thumbnail
   - Trim length
   - Aspect ratio selection

---

## Architecture

```
cinematic-video/
├── app/
│   ├── page.tsx                 (Home page)
│   ├── api/
│   │   ├── upload/route.ts      (Video upload)
│   │   └── process/route.ts     (FFmpeg processing)
│   └── layout.tsx
├── lib/
│   ├── supabase.ts              (DB client)
│   └── ffmpeg-worker.ts         (Grading engine)
├── components/
│   └── VideoUploader.tsx        (Main UI)
├── .env.local                   (Secrets)
└── package.json
```

---

## Command Reference

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check TypeScript
npm run type-check

# Format code
npm run format
```

---

## Deployment (Future)

When ready to go live:

```bash
# Deploy to Vercel
npm install -g vercel
vercel
```

Then set env vars in Vercel dashboard.

---

Good luck! 🎬
