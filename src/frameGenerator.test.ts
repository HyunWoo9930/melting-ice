import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("melt frame generator", () => {
  it("uses the Vite public asset directories for keyframes and output", () => {
    const script = readFileSync("scripts/build_melt_frames.py", "utf8");

    expect(script).toContain('ASSET_DIR = ROOT / "public" / "assets"');
    expect(script).toContain('OUT_DIR = ASSET_DIR / "frames"');
    expect(script).toContain('ASSET_DIR / "keyframes" / "ice-key-00.png"');
  });
});
