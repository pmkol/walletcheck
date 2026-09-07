import { describe, expect, it } from 'vitest';
import { findWrappedAddresses, readReflowedAddress } from '../src/recognition/address-lines';
import type { AddressLine } from '../src/recognition/address-lines';

const first: AddressLine = {
  text: `0x${'a'.repeat(26)}\n\n`, bbox: { x0: 100, y0: 100, x1: 800, y1: 133 },
};
const second: AddressLine = {
  text: `${'b'.repeat(14)}\n\n`, bbox: { x0: 450, y0: 162, x1: 800, y1: 194 },
};

describe('wrapped EVM address OCR regions', () => {
  it('finds adjacent centered address lines', () => {
    const centered = { ...second, bbox: { ...second.bbox, x0: 275, x1: 625 } };
    expect(findWrappedAddresses([first, centered])).toEqual([[first, centered]]);
  });
  it('finds adjacent right-aligned address lines without changing their text', () => {
    expect(findWrappedAddresses([first, second])).toEqual([[first, second]]);
  });

  it('allows an OCR-confused prefix only to locate pixels for re-recognition', () => {
    const confused = { ...first, text: first.text.replace('0x', 'Ox') };
    expect(findWrappedAddresses([confused, second])).toEqual([[confused, second]]);
    expect(confused.text.startsWith('Ox')).toBe(true);
  });

  it.each(['b'.repeat(13), 'b'.repeat(15), 'b'.repeat(13) + 'O', 'bbbb bbbbbbbbbb', '0x' + 'b'.repeat(12), '...bbbbbbbbbbb'])(
    'does not join an invalid continuation %s', (text) => {
      expect(findWrappedAddresses([first, { ...second, text }])).toEqual([]);
    },
  );

  it('does not join separate fields, columns or distant rows', () => {
    expect(findWrappedAddresses([first, { ...second, text: 'Network: Ethereum' }, second])).toEqual([]);
    expect(findWrappedAddresses([first, { ...second, bbox: { x0: 900, y0: 162, x1: 1250, y1: 194 } }])).toEqual([]);
    expect(findWrappedAddresses([first, { ...second, bbox: { ...second.bbox, y0: 400, y1: 433 } }])).toEqual([]);
  });

  it('preserves separate address groups rather than choosing one', () => {
    expect(findWrappedAddresses([first, second, first, second])).toEqual([[first, second], [first, second]]);
  });

  it('accepts a re-recognized prefix only when the entire address body agrees', () => {
    const confused = { ...first, text: first.text.replace('0x', 'Ox') };
    const address = first.text.trim() + second.text.trim();
    expect(readReflowedAddress(address, [confused, second])).toBe(address);
    expect(readReflowedAddress(address.replace('0x', 'Ox'), [confused, second])).toBeUndefined();
    expect(readReflowedAddress(address.replace('a', 'c'), [confused, second])).toBeUndefined();
    expect(readReflowedAddress(`${address}0`, [confused, second])).toBeUndefined();
    expect(readReflowedAddress('0x123456', [confused, second])).toBeUndefined();
  });
});
