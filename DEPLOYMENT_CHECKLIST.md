# Phase 1 Deployment Checklist

## ✅ Code Ready
- [x] Next.js scaffolding complete
- [x] TypeScript configured
- [x] Tailwind CSS included
- [x] API routes created (upload, process)
- [x] Supabase client configured
- [x] FFmpeg worker with color grading
- [x] VideoUploader component built
- [x] Home page with auth

---

## 📋 Pre-Launch Steps

### 1. Supabase Setup (10 min)
- [ ] Go to https://supabase.com
- [ ] Create new project ("cinematic-video")
- [ ] Copy API URL
- [ ] Copy Anon Key
- [ ] Copy Service Role Key
- [ ] Go to SQL Editor
- [ ] Run the SQL from SETUP.md (creates tables + buckets)
- [ ] Verify storage buckets exist: "videos" and "processed"

### 2. GitHub OAuth (10 min)
- [ ] Go to https://github.com/settings/developers
- [ ] Create new OAuth App
  - Name: "Cinematic Studio"
  - Homepage URL: http://localhost:3000
  - Callback URL: http://localhost:3000/auth/callback
- [ ] Copy Client ID and Secret
- [ ] Go to Supabase Dashboard → Authentication → Providers → GitHub
- [ ] Enable GitHub provider
- [ ] Paste Client ID and Secret
- [ ] Save

### 3. Local Configuration (5 min)
- [ ] Create `.env.local` in project root
- [ ] Copy values:
  ```
  NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  PROCESSING_DIR=/tmp/cinematic
  MAX_VIDEO_SIZE_MB=500
  FFMPEG_PATH=ffmpeg
  ```
- [ ] Verify FFmpeg installed: `ffmpeg --version`

### 4. Install Dependencies (5 min)
```bash
cd C:\Users\antoi\OneDrive\Desktop\cinematic-video
npm install
```
- [ ] No errors
- [ ] All 359+ packages installed

### 5. Test Locally (30 min)
```bash
npm run dev
```
- [ ] Server starts on http://localhost:3000
- [ ] Can sign in with GitHub
- [ ] Can upload a small test video (< 50MB)
- [ ] Video appears in Supabase storage/"videos"
- [ ] Can click "Apply Grade & Process"
- [ ] FFmpeg runs (see output in terminal)
- [ ] Processed video appears in storage/"processed"
- [ ] No errors in console

### 6. Test End-to-End (15 min)
- [ ] Upload 1-minute test video
- [ ] Try each grade preset:
  - [ ] Cinema Log to Rec.709
  - [ ] Teal & Orange
  - [ ] Kodak 2383
  - [ ] Film Noir
- [ ] Each produces different output (not just copy)
- [ ] File size increases (quality improvement)
- [ ] No crashes or hangs

---

## 🚀 Go-Live (When Ready)

### Deploy to Vercel
```bash
npm install -g vercel
vercel
```

1. [ ] Create Vercel account if needed
2. [ ] Connect GitHub repo
3. [ ] Set environment variables in Vercel:
   - [ ] NEXT_PUBLIC_SUPABASE_URL
   - [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
   - [ ] SUPABASE_SERVICE_ROLE_KEY
   - [ ] PROCESSING_DIR=/tmp/cinematic
4. [ ] Deploy
5. [ ] Test on live URL
6. [ ] Update GitHub OAuth callback URL to production URL

---

## 📊 Success Metrics (Phase 1)

You'll know it's working when:

✅ Users can sign in
✅ Upload any video format (MP4, MOV, etc.)
✅ Choose a cinematic grade
✅ Get back a processed video
✅ Video looks noticeably better (more contrast, color-graded, etc.)
✅ No errors or timeouts

---

## 🐛 Common Issues & Fixes

### "Cannot find module '@supabase/supabase-js'"
```bash
npm install @supabase/supabase-js@latest
```

### "FFmpeg not found"
```bash
# Check if installed
which ffmpeg

# If not, install:
# macOS:
brew install ffmpeg

# Windows (with choco):
choco install ffmpeg

# Linux:
sudo apt-get install ffmpeg
```

### "Storage bucket doesn't exist"
- Go to Supabase Dashboard
- Storage tab
- Create "videos" bucket (private)
- Create "processed" bucket (private)

### "Auth redirect loop"
- Check GitHub OAuth callback URL matches exactly
- Update in GitHub settings AND Supabase settings

### "Processing hangs on large file"
- Reduce test video size to < 100MB
- Check disk space on `/tmp` drive
- Increase `PROCESSING_DIR` timeout if needed

---

## 📱 What's Next (Phase 2)

Once Phase 1 is solid:

1. **Before/After Slider**
   - Show original vs graded side-by-side
   - Interactive preview

2. **Batch Processing**
   - Upload multiple videos
   - Queue them
   - Background jobs

3. **More Presets**
   - Add 10+ professional color grades
   - LUT upload support
   - Custom grade creation

4. **Video Export Options**
   - Multiple aspect ratios (9:16, 16:9, 1:1)
   - Resolution selection (1080p, 4K)
   - Format selection (H.265, ProRes, etc.)

5. **Social Publishing**
   - Instagram Reels direct upload
   - Facebook auto-posting
   - Hashtag & caption AI generation

6. **Mobile App**
   - React Native wrapper
   - Camera integration
   - One-click cinematic export

---

## 💬 Support

Issues? Questions?

1. Check QUICKSTART.md
2. Check SETUP.md
3. Check the code comments
4. Check Supabase docs: https://supabase.com/docs
5. Check Next.js docs: https://nextjs.org/docs

---

## 🎬 You're Ready!

Follow the checklist above. You'll have a working cinematic video enhancement platform in < 2 hours.

Good luck! 🚀
