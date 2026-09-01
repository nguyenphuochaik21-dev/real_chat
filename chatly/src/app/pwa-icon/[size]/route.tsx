import { ImageResponse } from 'next/og'

export const revalidate = 86_400

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: rawSize } = await params
  const size = Number(rawSize)
  if (size !== 192 && size !== 512) {
    return new Response('Unsupported icon size', { status: 404 })
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #8b5cf6, #4f46e5)',
        padding: size * 0.16,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '82%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: size * 0.22,
          backgroundColor: 'white',
          color: '#6d28d9',
          fontSize: size * 0.44,
          fontWeight: 800,
          boxShadow: `0 ${size * 0.04}px ${size * 0.12}px rgba(49, 46, 129, 0.28)`,
        }}
      >
        C
      </div>
    </div>,
    {
      width: size,
      height: size,
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    }
  )
}
