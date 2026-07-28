import { open, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const imagePath = process.argv[2];
if (!imagePath) {
  throw new Error("Usage: node tools/verify-image.mjs <uncompressed.img>");
}

const image = await stat(imagePath);
if (!image.isFile() || image.size < 16 * 1024 * 1024) {
  throw new Error(`Image is missing or implausibly small: ${image.size} bytes`);
}

const handle = await open(imagePath, "r");

async function readAt(position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error(`Unexpected end of image at byte ${position}`);
  }
  return buffer;
}

async function hasSquashfsAt(startLba) {
  const probe = await readAt(Number(startLba) * 512, 1024 * 1024);
  return probe.indexOf(Buffer.from("hsqs")) >= 0;
}

try {
  const sector0 = await readAt(0, 512);
  if (sector0[510] !== 0x55 || sector0[511] !== 0xaa) {
    throw new Error("Missing boot-sector signature 0x55AA");
  }

  const sector1 = await readAt(512, 512);
  const partitions = [];
  let table = "MBR";

  if (sector1.subarray(0, 8).toString("ascii") === "EFI PART") {
    table = "GPT";
    const entriesLba = sector1.readBigUInt64LE(72);
    const entryCount = Math.min(sector1.readUInt32LE(80), 256);
    const entrySize = sector1.readUInt32LE(84);
    if (entrySize < 128 || entrySize > 4096) {
      throw new Error(`Invalid GPT entry size: ${entrySize}`);
    }
    const entries = await readAt(
      Number(entriesLba) * 512,
      entryCount * entrySize,
    );
    for (let index = 0; index < entryCount; index += 1) {
      const entry = entries.subarray(index * entrySize, (index + 1) * entrySize);
      if (entry.subarray(0, 16).every((value) => value === 0)) continue;
      const firstLba = entry.readBigUInt64LE(32);
      const lastLba = entry.readBigUInt64LE(40);
      if (lastLba < firstLba) throw new Error(`Invalid GPT partition ${index + 1}`);
      partitions.push({ index: index + 1, firstLba, lastLba });
    }
  } else {
    for (let index = 0; index < 4; index += 1) {
      const offset = 446 + index * 16;
      const type = sector0[offset + 4];
      const firstLba = BigInt(sector0.readUInt32LE(offset + 8));
      const sectors = BigInt(sector0.readUInt32LE(offset + 12));
      if (!type || !sectors) continue;
      partitions.push({
        index: index + 1,
        firstLba,
        lastLba: firstLba + sectors - 1n,
      });
    }
  }

  if (partitions.length < 2) {
    throw new Error(`Expected at least two ${table} partitions, found ${partitions.length}`);
  }

  let squashfsPartition = null;
  for (const partition of partitions) {
    if (await hasSquashfsAt(partition.firstLba)) {
      squashfsPartition = partition.index;
      break;
    }
  }
  if (!squashfsPartition) {
    throw new Error("No SquashFS root filesystem found in the partition table");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        image: path.resolve(imagePath),
        bytes: image.size,
        partitionTable: table,
        partitions: partitions.length,
        squashfsPartition,
      },
      null,
      2,
    ),
  );
} finally {
  await handle.close();
}
