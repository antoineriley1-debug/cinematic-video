# Cinematic Video Studio - File Structure

```
cinematic-video/
│
├── 📖 DOCUMENTATION (Read These First)
│   ├── START_HERE.md              ← Begin here (5 min)
│   ├── QUICKSTART.md              ← Fast setup (30 min)
│   ├── SETUP.md                   ← Architecture & details (1 hour)
│   ├── DEPLOYMENT_CHECKLIST.md    ← Pre-launch verification
│   ├── README.md                  ← Project overview
│   └── FILE_STRUCTURE.md          ← This file
│
├── 🔧 CONFIGURATION
│   ├── .env.local.example         ← Copy to .env.local, fill with credentials
│   ├── package.json               ← All dependencies included
│   ├── tsconfig.json              ← TypeScript config (auto-generated)
│   ├── next.config.ts             ← Next.js config (auto-generated)
│   ├── tailwind.config.ts          ← Tailwind CSS config (auto-generated)
│   └── postcss.config.mjs          ← PostCSS config (auto-generated)
│
├── 📝 SOURCE CODE
│   │
│   ├── app/
│   │   ├── page.tsx               ← 👈 Home page (auth UI + VideoUploader)
│   │   ├── layout.tsx             ← Root layout
│   │   └── api/
│   │       ├── upload/
│   │       │   └── route.ts       ← 👈 POST /api/upload (receive video)
│   │       └── process/
│   │           └── route.ts       ← 👈 POST /api/process (FFmpeg processing)
│   │
│   ├── lib/
│   │   ├── supabase.ts            ← 👈 Database client (auth + CRUD)
│   │   └── ffmpeg-worker.ts       ← 👈 Color grading engine (4 LUTs)
│   │
│   └── components/
│       └── VideoUploader.tsx      ← 👈 Upload form + grade selector UI
│
├── 🎨 STYLES
│   ├── globals.css                ← Base Tailwind styles (auto-generated)
│   └── (Tailwind classes in TSX files)
│
├── 📦 DEPENDENCIES (Auto-generated)
│   └── node_modules/              ← npm install creates this
│
├── 🚀 BUILD OUTPUT (Auto-generated)
│   └── .next/                     ← npm run dev/build creates this
│
└── 📄 PROJECT FILES
    ├── .gitignore                 ← Git ignore rules (auto-generated)
    ├── .eslintrc.json             ← ESLint config (auto-generated)
    └── public/                    ← Static files (auto-generated)
```

---

## Files You Need to Create/Edit

### 1. `.env.local` (REQUIRED)
**Create this by copying `.env.local.example`**

```bash
# Content should be:
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PROCESSING_DIR=/tmp/cinematic
MAX_VIDEO_SIZE_MB=500
FFMPEG_PATH=ffmpeg
```

---

## Files Already Created for You

### Production Code (Ready to Use)
✅ `lib/supabase.ts`
✅ `lib/ffmpeg-worker.ts`
✅ `app/page.tsx`
✅ `app/api/upload/route.ts`
✅ `app/api/process/route.ts`
✅ `components/VideoUploader.tsx`

### Configuration (Ready to Use)
✅ `package.json` (with all dependencies)
✅ `tsconfig.json`
✅ `next.config.ts`
✅ `tailwind.config.ts`

### Documentation (Ready to Read)
✅ `START_HERE.md`
✅ `QUICKSTART.md`
✅ `SETUP.md`
✅ `DEPLOYMENT_CHECKLIST.md`
✅ `README.md`
✅ `FILE_STRUCTURE.md` (this file)

---

## Key Files Explained

### `lib/supabase.ts`
- Creates Supabase client for client-side operations
- Creates Supabase server client for API routes (service role)
- Exports both `supabase` and `supabaseServer()`

### `lib/ffmpeg-worker.ts`
- `processVideo()` function does the heavy lifting
- `getFilterChain()` builds FFmpeg filter strings based on grade preset
- Supports 4 color grades with different filter combinations

### `app/api/upload/route.ts`
- Receives POST request with video file + userId
- Saves video to Supabase Storage/"videos" bucket
- Creates database record in `videos` table
- Returns videoId for processing

### `app/api/process/route.ts`
- Receives POST request with videoId + gradePreset
- Downloads video from Supabase Storage
- Calls `ffmpeg-worker.processVideo()` to grade the video
- Uploads result to Supabase Storage/"processed" bucket
- Updates database record with final URL
- Cleans up temporary files

### `components/VideoUploader.tsx`
- Upload form with file input
- Grade preset dropdown (4 options)
- Process button that calls /api/process
- Result display when done
- Error handling & user feedback

### `app/page.tsx`
- Home page with auth check
- Shows GitHub OAuth button if not logged in
- Shows VideoUploader if logged in
- Handles auth state with Supabase hooks

---

## How to Add More Files

If you want to extend this in Phase 2, here's where to add things:

```
For new API endpoints:
  → app/api/new-feature/route.ts

For new UI components:
  → components/NewComponent.tsx

For new business logic:
  → lib/feature-logic.ts

For new styles:
  → Use Tailwind classes inline (no new CSS files needed)

For new pages:
  → app/new-page/page.tsx
```

---

## Dependencies Installed

```json
{
  "next": "16.2.6",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "@supabase/supabase-js": "^2.38.0",
  "axios": "^1.6.0",
  "dotenv": "^16.3.1",
  "fluent-ffmpeg": "^2.1.3",
  "uuid": "^9.0.1",
  "@types/fluent-ffmpeg": "^2.1.3",
  "tailwindcss": "^4",
  "typescript": "^5"
}
```

All installed automatically when you run `npm install`.

---

## What to Modify for Phase 2

### To add more color grades:
Edit `lib/ffmpeg-worker.ts` → `getFilterChain()` function
Add new preset name + FFmpeg filter string

### To add batch processing:
Edit `app/api/process/route.ts`
Accept array of videoIds instead of single videoId
Loop through and process each one

### To add before/after preview:
Edit `components/VideoUploader.tsx`
Add iframe showing original & processed videos side-by-side

### To add Instagram publishing:
Create `app/api/publish-instagram/route.ts`
Use Meta Graph API to post to user's Instagram account

---

## File Sizes

Typical file sizes (excluding node_modules):

```
lib/ffmpeg-worker.ts          ~3 KB
lib/supabase.ts               ~0.5 KB
app/api/upload/route.ts       ~2 KB
app/api/process/route.ts      ~2 KB
components/VideoUploader.tsx  ~5 KB
app/page.tsx                  ~3 KB
Documentation                 ~30 KB
Total                         ~45 KB
```

Tiny codebase. Highly readable. Ready to extend.

---

## Production Checklist

Before deploying to Vercel:

- [ ] All source files present (6 TypeScript files)
- [ ] `package.json` updated with dependencies
- [ ] `.env.local` created with real Supabase credentials
- [ ] Supabase database initialized (SQL run)
- [ ] GitHub OAuth app created & configured
- [ ] FFmpeg installed locally
- [ ] `npm install` completed without errors
- [ ] `npm run dev` starts without errors
- [ ] Can upload, process, and download a test video

---

## Next Actions

1. **Read** `START_HERE.md`
2. **Follow** `QUICKSTART.md`
3. **Execute** the 5 steps
4. **Test** with a video
5. **Celebrate** 🎉

---

**Everything you need is in this folder. Nothing is missing.**

Good luck! 🎬✨
