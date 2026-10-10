import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data: session } = await auth.getSession();
  return <p id="who">{session?.user?.email ?? 'signed out'}</p>;
}
