'use client';

import { formatEuro, formatTime } from '@tourneasy/shared';
import type { AppLocale } from '@tourneasy/shared/i18n';
import { Camera, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { markCollectedAction } from '@/server/actions/pricing-food-actions';

export type ScanOrder = {
  id: string;
  orderNumber: string;
  name: string;
  status: string;
  online: boolean;
  totalCents: number;
  collectedAt: Date | null;
  lines: { name: string; quantity: number }[];
};

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Order codes look like F-1A2B3C4D (see food-service). */
const ORDER_CODE = /F-[0-9A-F]{8}/;

/** Reads a QR code from the canvas: the browser's own detector, or jsQR (iPhone Safari). */
async function reader(): Promise<(canvas: HTMLCanvasElement) => Promise<string | null>> {
  const Native = (globalThis as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (canvas) => (await detector.detect(canvas))[0]?.rawValue ?? null;
  }
  const jsQR = (await import('jsqr')).default;
  return async (canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

/** Organiser at the food counter: scan a player's pickup code and hand the order out (D87). */
export function FoodScanner({
  tournamentId,
  orders,
}: {
  tournamentId: string;
  orders: ScanOrder[];
}) {
  const t = useTranslations('Food.scan');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [handedOut, setHandedOut] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const scanning = open && code === null;

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  // Camera runs only while the window is open and no code has been read yet.
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
        setCameraError(false);
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const read = await reader();
        const tick = async () => {
          if (stopped) return;
          if (v.videoWidth) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            canvas.getContext('2d', { willReadFrequently: true })!.drawImage(v, 0, 0);
            const value = await read(canvas).catch(() => null);
            const match = value?.toUpperCase().match(ORDER_CODE);
            if (match) {
              navigator.vibrate?.(80);
              setCode(match[0]);
              return;
            }
          }
          timer = setTimeout(tick, 200);
        };
        void tick();
      } catch {
        setCameraError(true);
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [scanning]);

  const order = code ? orders.find((o) => o.orderNumber === code) : undefined;
  const collected = !!order && (!!order.collectedAt || handedOut.has(order.id));
  const notPaidYet = !!order && order.status !== 'PAID' && order.online;
  const euro = (c: number) => formatEuro(c, locale);

  function handOut(id: string) {
    start(async () => {
      await markCollectedAction(locale, tournamentId, id);
      setHandedOut((s) => new Set(s).add(id));
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setCode(null);
          setOpen(true);
        }}
      >
        <Camera aria-hidden="true" />
        {t('open')}
      </Button>
      <dialog
        ref={dialog}
        onClose={() => {
          setOpen(false);
          setCode(null);
        }}
        aria-labelledby="food-scan-title"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="food-scan-title" className="font-heading text-lg font-semibold">
            {t('title')}
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-md p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{t('close')}</span>
          </button>
        </div>
        <div className="space-y-4 p-4">
          {scanning &&
            (cameraError ? (
              <p role="alert" className="text-sm text-destructive">
                {t('cameraError')}
              </p>
            ) : (
              <>
                <div className="relative overflow-hidden rounded-md bg-black">
                  <video
                    ref={video}
                    muted
                    playsInline
                    className="aspect-square w-full object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[15%] rounded-lg border-4 border-white/80"
                  />
                </div>
                <p className="text-center text-sm text-muted-foreground">{t('hint')}</p>
              </>
            ))}

          {code && !order && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 px-4 py-3 text-sm text-destructive"
            >
              {t('unknown', { code })}
            </p>
          )}

          {order && (
            <div className="space-y-3" role="status">
              <div>
                <p className="font-mono text-lg font-semibold">{order.orderNumber}</p>
                <p className="font-medium">{order.name}</p>
              </div>
              <ul className="space-y-1 text-base">
                {order.lines.map((l) => (
                  <li key={l.name}>
                    <strong className="tabular-nums">{l.quantity}×</strong> {l.name}
                  </li>
                ))}
              </ul>
              {collected ? (
                <p className="rounded-md border border-amber-500/50 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  {order.collectedAt
                    ? t('alreadyCollected', {
                        time: formatTime(new Date(order.collectedAt), locale),
                      })
                    : t('handedOut')}
                </p>
              ) : notPaidYet ? (
                <p className="rounded-md border border-destructive/40 px-4 py-3 text-sm text-destructive">
                  {t('notPaid')}
                </p>
              ) : (
                <>
                  {order.status !== 'PAID' && (
                    <p className="text-sm font-medium">
                      {t('collectMoney', { total: euro(order.totalCents) })}
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={pending}
                    onClick={() => handOut(order.id)}
                  >
                    {order.status === 'PAID' ? t('handOut') : t('handOutPaid')}
                  </Button>
                </>
              )}
            </div>
          )}

          {code && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setCode(null)}
            >
              {t('next')}
            </Button>
          )}
        </div>
      </dialog>
    </>
  );
}
