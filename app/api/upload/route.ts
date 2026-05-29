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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
