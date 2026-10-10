import { MESSAGES } from '@webtwizz/cloud';
import { FileError, createFiles } from '@webtwizz/cloud/files';
import { auth } from '@/lib/auth/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: 'Sign in first' }, { status: 401 });
  const { name, type, size } = await request.json();
  try {
    const upload = await createFiles().uploadUrl({ bucket: 'public', name, type, size, folder: session.user.id, accept: ['image/*'] });
    await sql`select 1`;
    return Response.json(upload);
  } catch (error) {
    if (error instanceof FileError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: MESSAGES.saveFailed }, { status: 500 });
  }
}
