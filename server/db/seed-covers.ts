import { deflateSync } from 'node:zlib';
function crc32(bytes: Buffer): number { let crc = 0xffffffff; for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++)
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
} return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer): Buffer { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, checksum]); }
export function makeCover(index: number): Buffer {
    const size = 240, pixels = Buffer.alloc((size * 3 + 1) * size), colors = [[213, 230, 221], [221, 231, 240], [237, 226, 203], [220, 216, 235]];
    const color = colors[index % colors.length];
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const offset = y * (size * 3 + 1) + 1 + x * 3;
            let c = color;
            if (index === 0 && x > 65 && x < 175 && y > 35 && y < 205)
                c = x < 76 ? [36, 94, 74] : [255, 254, 247];
            if (index === 1 && ((y > 183 && y < 192 && x > 60 && x < 190) || (x > 147 && x < 155 && y > 60 && y < 187) || (y > 45 && y < 70 && x > 90 && x < 176)))
                c = [52, 85, 110];
            if (index === 2 && (Math.abs(Math.hypot(x - 110, y - 95) - 45) < 6 || (x > 140 && x < 151 && y > 125 && y < 212)))
                c = [105, 99, 58];
            if (index === 3 && y > 78 && y < 165 && x > 26 && x < 214)
                c = (x % 22 < 3 || y % 22 < 3) ? [67, 62, 84] : [249, 247, 254];
            pixels.set(c, offset);
        }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
