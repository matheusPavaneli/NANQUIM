import { grantAllows, hasGrantSecret, readGrant } from '../../grant';
import { providerStatusSchema, unwrapProvider } from '../../shape';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const key = process.env.ABACATEPAY_API_KEY;
  if (key === undefined) return Response.json({ error: 'missing key' }, { status: 500 });
  if (!hasGrantSecret()) return Response.json({ error: 'missing grant secret' }, { status: 500 });
  const { id } = await params;

  if (!grantAllows(readGrant(request), id)) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const response = await fetch(
    `https://api.abacatepay.com/v1/pixQrCode/check?id=${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return Response.json({ error: 'STATUS_UNAVAILABLE' }, { status: 502 });

  const parsed = providerStatusSchema.safeParse(unwrapProvider(await response.json()));
  if (!parsed.success) return Response.json({ error: 'STATUS_UNAVAILABLE' }, { status: 502 });

  return Response.json(parsed.data, { headers: { 'cache-control': 'no-store' } });
}
