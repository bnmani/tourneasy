import { ImageResponse } from 'next/og';
import { markDataUrl } from '@/lib/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon for iPhone and iPad: the shuttle mark on a full square. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2e4a67',
      }}
    >
      <img src={markDataUrl()} width={170} height={170} alt="" />
    </div>,
    size,
  );
}
