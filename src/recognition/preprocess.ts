export function hasDarkBackground(pixels: Uint8ClampedArray, width: number, height: number): boolean {
  let darkPixels = 0;
  let darkBorderPixels = 0;
  let borderPixels = 0;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const offset = (row * width + column) * 4;
      const dark = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722 < 96;
      if (dark) darkPixels += 1;
      if (row === 0 || column === 0 || row === height - 1 || column === width - 1) {
        borderPixels += 1;
        if (dark) darkBorderPixels += 1;
      }
    }
  }
  return darkPixels > width * height * 0.6 && darkBorderPixels > borderPixels * 0.6;
}

export function prepareOcrImage(image: HTMLCanvasElement): HTMLCanvasElement {
  const sample = document.createElement('canvas');
  sample.width = 32;
  sample.height = 32;
  const sampling = sample.getContext('2d', { willReadFrequently: true });
  if (!sampling) throw new Error('浏览器不支持 Canvas');
  sampling.drawImage(image, 0, 0, 32, 32);
  const darkBackground = hasDarkBackground(sampling.getImageData(0, 0, 32, 32).data, 32, 32);
  sample.width = 0;
  sample.height = 0;
  if (!darkBackground && Math.max(image.width, image.height) >= 1600) return image;
  const canvas = document.createElement('canvas');
  const scale = Math.min(3.2, 2400 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const drawing = canvas.getContext('2d', { willReadFrequently: true });
  if (!drawing) throw new Error('浏览器不支持 Canvas');
  if (typeof drawing.filter === 'string') {
    drawing.filter = 'grayscale(1) invert(1)';
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const luminance = Math.round(pixels.data[offset] * 0.2126
      + pixels.data[offset + 1] * 0.7152 + pixels.data[offset + 2] * 0.0722);
    pixels.data[offset] = 255 - luminance;
    pixels.data[offset + 1] = 255 - luminance;
    pixels.data[offset + 2] = 255 - luminance;
  }
  drawing.putImageData(pixels, 0, 0);
  return canvas;
}
