import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface RemoteScreenFrameHandle {
  setFrame: (jpegBase64: string) => void;
}

interface RemoteScreenFrameProps {
  className?: string;
}

function base64ToBlob(jpegBase64: string): Blob {
  const binary = atob(jpegBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

function paintViaImage(
  blob: Blob,
  draw: (source: CanvasImageSource, w: number, h: number) => void,
  isCurrent: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      if (isCurrent()) draw(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

/**
 * Canvas renderer — decodes off-screen then draws in one pass so frames never
 * flash blank between updates (the main cause of "blinking" vs RDP).
 */
export const RemoteScreenFrame = forwardRef<RemoteScreenFrameHandle, RemoteScreenFrameProps>(
  function RemoteScreenFrame({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const paintGenRef = useRef(0);

    const paintBlob = (blob: Blob): Promise<void> => {
      const canvas = canvasRef.current;
      if (!canvas) return Promise.resolve();

      const gen = ++paintGenRef.current;
      const isCurrent = () => gen === paintGenRef.current;

      const drawBitmap = (source: CanvasImageSource, w: number, h: number) => {
        if (!isCurrent() || !canvasRef.current) return;
        const c = canvasRef.current;
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const ctx = c.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.drawImage(source, 0, 0, w, h);
      };

      if (typeof createImageBitmap !== 'undefined') {
        return createImageBitmap(blob)
          .then((bitmap) => {
            if (!isCurrent()) {
              bitmap.close();
              return;
            }
            drawBitmap(bitmap, bitmap.width, bitmap.height);
            bitmap.close();
          })
          .catch(() => paintViaImage(blob, drawBitmap, isCurrent));
      }
      return paintViaImage(blob, drawBitmap, isCurrent);
    };

    useImperativeHandle(ref, () => ({
      setFrame(jpegBase64: string) {
        if (!jpegBase64) return;
        try {
          void paintBlob(base64ToBlob(jpegBase64));
        } catch {
          /* ignore corrupt frame */
        }
      },
    }));

    useEffect(() => {
      return () => {
        paintGenRef.current += 1;
      };
    }, []);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        aria-label="Remote screen"
        role="img"
      />
    );
  },
);
