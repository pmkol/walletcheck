import QrScanner from 'qr-scanner';

export async function scanQr(image: HTMLCanvasElement, signal: AbortSignal): Promise<string[]> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('浏览器不支持 Canvas');
  drawing.drawImage(image, 0, 0);
  const payloads: string[] = [];
  const regions = [
    undefined,
    { x: 0, y: 0, width: Math.ceil(canvas.width * 0.6), height: canvas.height },
    { x: Math.floor(canvas.width * 0.4), y: 0, width: Math.ceil(canvas.width * 0.6), height: canvas.height },
    { x: 0, y: 0, width: canvas.width, height: Math.ceil(canvas.height * 0.6) },
    { x: 0, y: Math.floor(canvas.height * 0.4), width: canvas.width, height: Math.ceil(canvas.height * 0.6) },
  ];
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      signal.throwIfAborted();
      let result: QrScanner.ScanResult | undefined;
      for (const scanRegion of regions) {
        signal.throwIfAborted();
        try {
          result = await QrScanner.scanImage(canvas, {
            returnDetailedScanResult: true,
            scanRegion,
          });
          break;
        } catch (error) {
          signal.throwIfAborted();
          if (error !== QrScanner.NO_QR_CODE_FOUND) throw error;
        }
      }
      if (!result) break;
      signal.throwIfAborted();
      payloads.push(result.data);
      if (!result.cornerPoints.length) break;
      const left = Math.min(...result.cornerPoints.map((point) => point.x));
      const top = Math.min(...result.cornerPoints.map((point) => point.y));
      const right = Math.max(...result.cornerPoints.map((point) => point.x));
      const bottom = Math.max(...result.cornerPoints.map((point) => point.y));
      drawing.fillStyle = '#ffffff';
      drawing.fillRect(left - 4, top - 4, right - left + 8, bottom - top + 8);
    }
    if (payloads.length === 8) throw new Error('二维码过多，请裁剪到一个收款区域');
    return [...new Set(payloads)];
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
