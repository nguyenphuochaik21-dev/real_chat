export const revalidate = 86_400

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params
  const size = Number(rawSize)
  if (size !== 192 && size !== 512) {
    return new Response('Unsupported icon size', { status: 404 })
  }

  return Response.redirect(new URL(`/icons/chatly-${size}.png`, request.url), 307)
}
