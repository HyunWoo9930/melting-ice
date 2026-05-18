from __future__ import annotations

from collections import deque
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public" / "assets"
OUT_DIR = ASSET_DIR / "frames"
KEYFRAMES = [
    ASSET_DIR / "keyframes" / "ice-key-00.png",
    ASSET_DIR / "keyframes" / "ice-key-35.png",
    ASSET_DIR / "keyframes" / "ice-key-70.png",
    ASSET_DIR / "keyframes" / "ice-key-100.png",
]
OUTPUT_SIZE = 720
FRAME_COUNT = 256
FRAME_EXTENSION = "webp"
WEBP_QUALITY = 90
WEBP_METHOD = 4

TARGET_BBOXES = [
    (121.0, 161.0, 607.0, 660.0),
    (110.0, 194.0, 621.0, 668.0),
    (65.0, 314.0, 684.0, 663.0),
    (35.0, 469.0, 713.0, 635.0),
]


def smoothstep(amount: float) -> float:
    return amount * amount * (3 - 2 * amount)


def square_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width == height:
        return image

    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def fill_mask_holes(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        for y in (0, height - 1):
            if not mask[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))

    for y in range(height):
        for x in (0, width - 1):
            if not mask[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if (
                0 <= next_y < height
                and 0 <= next_x < width
                and not visited[next_y, next_x]
                and not mask[next_y, next_x]
            ):
                visited[next_y, next_x] = True
                queue.append((next_y, next_x))

    return mask | (~visited)


def foreground_mask(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    max_channel = rgb.max(axis=2)
    min_channel = rgb.min(axis=2)
    saturation = max_channel - min_channel
    y_axis = np.arange(rgb.shape[0])[:, None]
    blue_bias = blue - red

    mask = (
        ((blue_bias > 7) & (blue > 116) & (y_axis > 170))
        | ((saturation > 22) & (blue >= red) & (y_axis > 180))
        | ((max_channel < 188) & (y_axis > 300) & (blue_bias > -6))
    )
    mask[:150, :] = False
    mask = fill_mask_holes(mask)

    mask_image = Image.fromarray((mask * 255).astype(np.uint8), "L")
    return mask_image.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))


def make_transparent_frame(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgba.putalpha(foreground_mask(image))
    return rgba


def load_keyframe(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    image = square_crop(image)
    image = image.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)
    return make_transparent_frame(image)


def alpha_bbox(image: Image.Image, threshold: int = 12) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.getchannel("A"))
    y_values, x_values = np.where(alpha > threshold)
    if len(x_values) == 0:
        return (0, 0, image.width - 1, image.height - 1)

    return (int(x_values.min()), int(y_values.min()), int(x_values.max()), int(y_values.max()))


def interpolate_bbox(
    start: tuple[float, float, float, float],
    end: tuple[float, float, float, float],
    amount: float,
) -> tuple[float, float, float, float]:
    return tuple(start[index] + (end[index] - start[index]) * amount for index in range(4))


def fit_to_bbox(
    image: Image.Image,
    source_bbox: tuple[int, int, int, int],
    target_bbox: tuple[float, float, float, float],
) -> Image.Image:
    source_left, source_top, source_right, source_bottom = source_bbox
    target_left, target_top, target_right, target_bottom = target_bbox
    target_width = max(1, round(target_right - target_left + 1))
    target_height = max(1, round(target_bottom - target_top + 1))

    crop = image.crop((source_left, source_top, source_right + 1, source_bottom + 1))
    resized = crop.resize((target_width, target_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(resized, (round(target_left), round(target_top)))
    return canvas


def frame_at_progress(
    keyframes: list[Image.Image],
    source_bboxes: list[tuple[int, int, int, int]],
    progress: float,
) -> Image.Image:
    position = progress * (len(keyframes) - 1)
    previous_index = int(np.floor(position))

    if previous_index >= len(keyframes) - 1:
        return fit_to_bbox(keyframes[-1], source_bboxes[-1], TARGET_BBOXES[-1])

    amount = smoothstep(position - previous_index)
    target_bbox = interpolate_bbox(TARGET_BBOXES[previous_index], TARGET_BBOXES[previous_index + 1], amount)
    previous_frame = fit_to_bbox(keyframes[previous_index], source_bboxes[previous_index], target_bbox)
    next_frame = fit_to_bbox(keyframes[previous_index + 1], source_bboxes[previous_index + 1], target_bbox)
    return Image.blend(previous_frame, next_frame, amount)


def save_frame(frame: Image.Image, output_path: Path) -> None:
    if FRAME_EXTENSION == "webp":
        cwebp = shutil.which("cwebp")
        if cwebp:
            with tempfile.NamedTemporaryFile(suffix=".png") as temp_file:
                frame.save(temp_file.name, "PNG")
                subprocess.run(
                    [
                        cwebp,
                        "-quiet",
                        "-q",
                        str(WEBP_QUALITY),
                        "-alpha_q",
                        "100",
                        "-m",
                        str(WEBP_METHOD),
                        temp_file.name,
                        "-o",
                        str(output_path),
                    ],
                    check=True,
                )
            return

        frame.save(output_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD, exact=True)
        return

    frame.save(output_path, optimize=True)


def main() -> None:
    missing = [str(path) for path in KEYFRAMES if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing keyframes: {', '.join(missing)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale_frame in [*OUT_DIR.glob("ice-*.png"), *OUT_DIR.glob("ice-*.webp")]:
        stale_frame.unlink()

    keyframes = [load_keyframe(path) for path in KEYFRAMES]
    source_bboxes = [alpha_bbox(frame) for frame in keyframes]
    digits = len(str(FRAME_COUNT - 1))

    for index in range(FRAME_COUNT):
        progress = index / (FRAME_COUNT - 1)
        frame = frame_at_progress(keyframes, source_bboxes, progress)
        output_path = OUT_DIR / f"ice-{index:0{digits}d}.{FRAME_EXTENSION}"
        save_frame(frame, output_path)


if __name__ == "__main__":
    main()
