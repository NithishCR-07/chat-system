import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Robust Same-Origin File Proxy & Download Handler
 * Prevents browser "Couldn't download - Network issue" and CORS errors for all chat attachments.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const customFileName = searchParams.get('filename');
    const isPreview = searchParams.get('preview') === 'true';

    if (!targetUrl) {
      return new NextResponse('Missing file URL parameter', { status: 400 });
    }

    const admin = createAdminClient();
    let fileBuffer = null;
    let contentType = 'application/octet-stream';
    let resolvedFileName = customFileName || 'file';

    // 1. Try resolving storage path from Supabase Storage URL
    let storagePath = null;
    const match = targetUrl.match(/chat-attachments\/(.+?)(\?|$)/);
    if (match && match[1]) {
      storagePath = decodeURIComponent(match[1]);
    }

    if (storagePath) {
      // Use Admin Client download (guaranteed to bypass any storage RLS)
      const { data: fileBlob, error: downloadError } = await admin.storage
        .from('chat-attachments')
        .download(storagePath);

      if (!downloadError && fileBlob) {
        fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
        contentType = fileBlob.type || 'application/octet-stream';
      }
    }

    // 2. Fallback: Fetch directly from target URL if storage download wasn't possible
    if (!fileBuffer) {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return new NextResponse('Failed to fetch file from source', { status: response.status });
      }
      fileBuffer = Buffer.from(await response.arrayBuffer());
      contentType = response.headers.get('content-type') || contentType;
    }

    // Sanitize filename for safe Content-Disposition
    const safeFileName = resolvedFileName
      .replace(/["\r\n\\]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_');

    const dispositionType = isPreview ? 'inline' : 'attachment';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${dispositionType}; filename="${safeFileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Download route handler error:', err);
    return new NextResponse('Internal server error during download', { status: 500 });
  }
}
