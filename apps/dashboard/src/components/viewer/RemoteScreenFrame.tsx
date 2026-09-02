import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface RemoteScreenFrameHandle {
  setFrame: (jpegBase64: string) => void;
}

interface RemoteScreenFrameProps {
  className?: string;
}

/**
 * Renders remote JPEG frames via direct img.src updates — avoids re-rendering
 * the whole viewer on every frame (60fps) or pointer move.
 */
export const RemoteScreenFrame = forwardRef<RemoteScreenFrameHandle, RemoteScreenFrameProps>(
  function RemoteScreenFrame({ className }, ref) {
    const imgRef = useRef<HTMLImageElement>(null);

    useImperativeHandle(ref, () => ({
      setFrame(jpegBase64: string) {
        const el = imgRef.current;
        if (!el) return;
        const src = `data:image/jpeg;base64,${jpegBase64}`;
        if (el.src !== src) el.src = src;
      },
    }));

    return (
      <img
        ref={imgRef}
        alt="Remote screen"
        className={className}
        draggable={false}
        decoding="async"
      />
    );
  },
);
