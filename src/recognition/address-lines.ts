export interface AddressLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export function findWrappedAddresses(lines: AddressLine[]): AddressLine[][] {
  const groups: AddressLine[][] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const first = lines[index];
    const second = lines[index + 1];
    const prefix = first.text.trim();
    const suffix = second.text.trim();
    if (!/^[0O]x[0-9a-fA-F]{8,38}$/.test(prefix) || !/^[0-9a-fA-F]{2,32}$/.test(suffix)
      || prefix.length + suffix.length !== 42) continue;
    const height = Math.max(first.bbox.y1 - first.bbox.y0, second.bbox.y1 - second.bbox.y0);
    const gap = second.bbox.y0 - first.bbox.y1;
    const aligned = Math.min(
      Math.abs(first.bbox.x0 - second.bbox.x0),
      Math.abs(first.bbox.x1 - second.bbox.x1),
      Math.abs((first.bbox.x0 + first.bbox.x1 - second.bbox.x0 - second.bbox.x1) / 2),
    ) <= height;
    if (height > 0 && gap >= 0 && gap <= height * 2 && aligned) {
      groups.push([first, second]);
      index += 1;
    }
  }
  return groups;
}

export function readReflowedAddress(text: string, lines: AddressLine[]): string | undefined {
  const address = text.trim();
  const original = lines.map((line) => line.text.trim()).join('');
  return /^0x[0-9a-fA-F]{40}$/.test(address) && address.slice(2) === original.slice(2) ? address : undefined;
}

export function reflowAddressImage(image: HTMLCanvasElement, lines: AddressLine[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const padding = 16;
  const height = Math.max(...lines.map((line) => line.bbox.y1 - line.bbox.y0));
  const totalWidth = lines.reduce((width, line) => width + line.bbox.x1 - line.bbox.x0 + 2, 0);
  const scale = Math.min(6, 4096 / totalWidth, 66 / height);
  canvas.width = Math.ceil(totalWidth * scale + padding * 2);
  canvas.height = Math.ceil(height * scale + padding * 2);
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('浏览器不支持 Canvas');
  drawing.fillStyle = '#ffffff';
  drawing.fillRect(0, 0, canvas.width, canvas.height);
  let left = padding;
  for (const { bbox } of lines) {
    const width = bbox.x1 - bbox.x0;
    const lineHeight = bbox.y1 - bbox.y0;
    drawing.drawImage(image, bbox.x0, bbox.y0, width, lineHeight,
      left, padding + (height - lineHeight) * scale, width * scale, lineHeight * scale);
    left += (width + 2) * scale;
  }
  const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const value = pixels.data[offset] < 128 ? 0 : 255;
    pixels.data[offset] = value;
    pixels.data[offset + 1] = value;
    pixels.data[offset + 2] = value;
  }
  drawing.putImageData(pixels, 0, 0);
  return canvas;
}
