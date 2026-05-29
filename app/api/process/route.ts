import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { processVideo } from '@/lib/ffmpeg-worker';
import fs from 'fs';
import path from 'path';

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
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId);

    // Clean up temp file
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }

    return NextResponse.json({
      success: true,
      videoId,
      processedUrl: processedFilename,
      message: 'Video processed successfully',
    });
  } catch (error: any) {
    console.error('Processing error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
