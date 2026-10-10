import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: session } = await auth.getSession();
  return Response.json({ email: session?.user?.email ?? null });
}
