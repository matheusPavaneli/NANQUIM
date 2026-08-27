export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const key = process.env.ABACATEPAY_API_KEY;
  if (key === undefined) return Response.json({ error: 'missing key' }, { status: 500 });
  const { id } = await params;

  const response = await fetch(
    `https://api.abacatepay.com/v1/pixQrCode/check?id=${encodeURIComponent(id)}`,
    { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return Response.json({ error: 'STATUS_UNAVAILABLE' }, { status: 502 });
  return Response.json(await response.json());
}
