"""Prepare a compact, camera-cone subset of the HYG 4.1 star catalog."""

import argparse
import csv
import math
from pathlib import Path
import struct


# ICRS / J2000 equatorial -> Galactic Cartesian coordinates.
EQUATORIAL_TO_GALACTIC = (
    (-0.0548755604, -0.8734370902, -0.4838350155),
    (0.4941094279, -0.4448296300, 0.7469822445),
    (-0.8676661490, -0.1980763734, 0.4559837762),
)
LONGITUDE, LATITUDE = map(math.radians, (16, 7))
FORWARD = (
    math.cos(LATITUDE) * math.cos(LONGITUDE),
    math.cos(LATITUDE) * math.sin(LONGITUDE),
    math.sin(LATITUDE),
)
MIN_COSINE = math.cos(math.radians(73))
HORIZON_YEARS = 350_000
STAR = struct.Struct("<3h3eBB")


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def galactic(vector, scale):
    return tuple(dot(row, vector) * scale for row in EQUATORIAL_TO_GALACTIC)


def enters_view(position, travel):
    """Find whether any point on the path projects into the padded camera cone."""
    z = dot(position, FORWARD)
    vz = dot(travel, FORWARD)
    a = dot(position, position)
    b = dot(position, travel)
    c = dot(travel, travel)
    times = [0.0, 1.0]
    denominator = vz * b - z * c
    if denominator:
        extremum = (z * b - vz * a) / denominator
        if 0 < extremum < 1:
            times.append(extremum)
    return any((z + vz * t) > MIN_COSINE * math.sqrt(max(0, a + 2 * b * t + c * t * t)) for t in times)


def pack_star(row):
    distance = float(row["dist"])
    magnitude = float(row["mag"])
    if distance <= 0 or distance >= 5000 or magnitude > 8.7:
        return None
    xyz = tuple(float(row[key]) for key in ("x", "y", "z"))
    velocity = tuple(float(row[key]) for key in ("vx", "vy", "vz"))
    length = math.hypot(*xyz)
    position = galactic(xyz, 1 / length)
    travel = galactic(velocity, HORIZON_YEARS / length)
    if not enters_view(position, travel):
        return None
    index = float(row["ci"]) if row["ci"] else 0.4
    tint = sum(index > threshold for threshold in (-0.10, 0.25, 0.65, 1.28))
    brightness = min(21, max(0, round(2 * (magnitude + 1.5))))
    direction = [round(32767 * max(-1, min(1, component))) for component in position]
    return STAR.pack(*direction, *travel, brightness, tint)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", type=Path, help="Upstream hygdata_v41.csv")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "stars.bin")
    args = parser.parse_args()
    with args.catalog.open(newline="", encoding="utf-8") as source:
        entries = [packed for row in csv.DictReader(source) if (packed := pack_star(row)) is not None]
    args.output.write_bytes(b"HYG2" + struct.pack("<I", len(entries)) + b"".join(entries))
    print(f"Packed {len(entries):,} stars ({args.output.stat().st_size:,} bytes).")


if __name__ == "__main__":
    main()
