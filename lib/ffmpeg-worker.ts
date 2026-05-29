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
        '-crf 18',
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
      .on('progress', (progress: any) => {
        console.log(`Processing: ${Math.round(progress.percent || 0)}%`);
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
    // Base levels
    'clean': 'eq=contrast=1.06:saturation=1.05:brightness=0.02',
    'social': 'eq=contrast=1.08:saturation=1.16:brightness=0.03',
    
    // Cinematic levels
    'teal': 'colorbalance=rs=0.1:bs=-0.1:rm=-0.1:bm=0.1,eq=saturation=1.2:contrast=1.1',
    'kodak': 'eq=saturation=1.10:contrast=1.10:brightness=0.02,colorbalance=rs=0.08:bs=-0.05',
    'fuji': 'eq=contrast=0.96:saturation=0.95:brightness=0.05',
    'moody': 'eq=contrast=1.18:saturation=0.80:brightness=-0.08',
    'commerc': 'eq=contrast=1.05:saturation=1.08:brightness=0.06',
    'urban': 'eq=contrast=1.16:saturation=0.90:brightness=-0.03',
    'mv': 'eq=contrast=1.22:saturation=1.30:brightness=0.02',
    'lux': 'eq=contrast=1.08:saturation=0.92:brightness=0.02',
    'doc': 'eq=saturation=1.06:brightness=0.03,colorbalance=rs=0.06:bs=-0.02',
    'bw': 'format=gray,eq=contrast=1.22',
  };

  return filters[preset] || filters['social'];
}
