export interface AddressLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export function findWrappedAddresses(lines: AddressLine[]): AddressLine[][] {
  const groups: AddressLine[][] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const first = lines[index];
    const prefix = first.text.trim();
    if (!/^[0O]x[0-9a-fA-F]{8,38}$/.test(prefix)) continue;
    const candidates: AddressLine[] = [];
    for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
      const second = lines[next];
      const suffix = second.text.trim();
      if (!/^[0-9a-fA-F]{2,32}$/.test(suffix) || prefix.length + suffix.length !== 42) continue;
      const height = Math.max(first.bbox.y1 - first.bbox.y0, second.bbox.y1 - second.bbox.y0);
      const gap = second.bbox.y0 - first.bbox.y1;
      const aligned = Math.min(
        Math.abs(first.bbox.x0 - second.bbox.x0),
        Math.abs(first.bbox.x1 - second.bbox.x1),
        Math.abs((first.bbox.x0 + first.bbox.x1 - second.bbox.x0 - second.bbox.x1) / 2),
      ) <= height;
      const left = Math.min(first.bbox.x0, second.bbox.x0);
      const right = Math.max(first.bbox.x1, second.bbox.x1);
      const interrupted = lines.slice(index + 1, next).some((line) => line.bbox.x1 > left && line.bbox.x0 < right);
      if (height > 0 && gap >= 0 && gap <= height * 2 && aligned && !interrupted) candidates.push(second);
    }
    if (candidates.length === 1) groups.push([first, candidates[0]]);
  }
  return groups;
}

export function replaceWrappedAddress(text: string, lines: AddressLine[], address: string): string {
  if (lines.length !== 2 || readReflowedAddress(address, lines) !== address) return text;
  const matches = lines.map((line) => {
    const escaped = line.text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...text.matchAll(new RegExp(`^[ \\t]*${escaped}[ \\t]*\\r?$`, 'gm'))];
  });
  if (matches.some((entries) => entries.length !== 1)) return text;
  const [first, second] = matches.map((entries) => entries[0]);
  if (first.index >= second.index) return text;
  return text.slice(0, first.index) + address + text.slice(first.index + first[0].length, second.index)
    + text.slice(second.index + second[0].length);
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
