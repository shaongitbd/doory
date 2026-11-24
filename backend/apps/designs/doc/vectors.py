"""Build native Fabric paths from the bounded, absolute commands accepted by add_vector."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from . import groups
from .builders import new_id

Point = tuple[float, float]
Command = Sequence[str | float]
MAX_PLACED_SIZE = 100_000


@dataclass(frozen=True)
class VectorPath:
    commands: Sequence[Command]
    name: str | None = None
    fill: str | None = None
    stroke: str | None = None
    stroke_width: float = 0
    fill_rule: Literal["nonzero", "evenodd"] = "nonzero"


def _cubic_bounds(p0: float, p1: float, p2: float, p3: float) -> tuple[float, float]:
    """Bounds on one axis; an interior extremum occurs at a root of the derivative."""
    a = -3 * p0 + 9 * p1 - 9 * p2 + 3 * p3
    b = 6 * p0 - 12 * p1 + 6 * p2
    c = 3 * p1 - 3 * p0
    if abs(a) < 1e-12:
        roots = (-c / b,) if abs(b) >= 1e-12 else ()
    elif (discriminant := b * b - 4 * a * c) >= 0:
        delta = math.sqrt(discriminant)
        roots = ((-b + delta) / (2 * a), (-b - delta) / (2 * a))
    else:
        roots = ()
    values = [p0, p3]
    for t in roots:
        if 0 < t < 1:
            s = 1 - t
            values.append(s**3 * p0 + 3 * s**2 * t * p1 + 3 * s * t**2 * p2 + t**3 * p3)
    return min(values), max(values)


def _quadratic_as_cubic(start: Point, control: Point, end: Point) -> list[Point]:
    # Store the equivalent cubic so Fabric measures the same curve when it loads the path.
    cx, cy = control
    sx, sy = start
    ex, ey = end
    return [
        (sx + (cx - sx) * 2 / 3, sy + (cy - sy) * 2 / 3),
        (ex + (cx - ex) * 2 / 3, ey + (cy - ey) * 2 / 3),
        end,
    ]


def _can_fill(points: list[Point]) -> bool:
    """A subpath needs some geometry off its starting line to enclose an area."""
    x, y = points[0]
    direction = next(((px - x, py - y) for px, py in points[1:] if (px, py) != (x, y)), None)
    if direction is None:
        return False
    dx, dy = direction
    return any(not math.isclose(dx * (py - y), dy * (px - x), rel_tol=1e-12) for px, py in points[1:])


def _has_paint(color: str | None) -> bool:
    if color is None:
        return False
    if len(color) == 5:  # #RGBA
        return color[-1] != "0"
    if len(color) == 9:  # #RRGGBBAA
        return color[-2:] != "00"
    return True


def _path_geometry(
    path: VectorPath, origin: Point, scale: float
) -> tuple[list[list[str | float]], tuple[float, float, float, float]]:
    commands: list[list[str | float]] = []
    subpaths: list[list[Point]] = []
    xs: list[float] = []
    ys: list[float] = []
    current = (0.0, 0.0)
    closed = False
    for index, source in enumerate(path.commands, 1):
        command = source[0]
        if not subpaths and command != "M":
            raise ValueError(f"Command {index}: Start the path with an M command.")
        points = [
            ((float(x) - origin[0]) * scale, (float(y) - origin[1]) * scale)
            for x, y in zip(source[1::2], source[2::2], strict=True)
        ]
        if not all(abs(value) <= MAX_PLACED_SIZE for point in points for value in point):
            raise ValueError(f"Command {index}: The placed path coordinates are too large.")
        if command == "M":
            current = points[0]
            subpaths.append([current])
            closed = False
        elif command == "Z":
            current = subpaths[-1][0]
            closed = True
        else:
            # A segment after a close starts another subpath at the close point.
            if closed:
                subpaths.append([current])
                closed = False
            if command == "Q":
                points = _quadratic_as_cubic(current, *points)
                command = "C"
            if command == "C":
                x_curve, y_curve = zip(current, *points, strict=True)
                xs.extend(_cubic_bounds(*x_curve))
                ys.extend(_cubic_bounds(*y_curve))
            else:
                end = points[0]
                xs.extend((current[0], end[0]))
                ys.extend((current[1], end[1]))
            subpaths[-1].extend(points)
            current = points[-1]
        commands.append([command, *(value for point in points for value in point)])

    if not xs:
        raise ValueError("The path needs at least one drawing command.")
    bounds = (min(xs), min(ys), max(xs), max(ys))
    if bounds[0] == bounds[2] and bounds[1] == bounds[3]:
        raise ValueError("The path has no drawable extent.")
    stroke_visible = _has_paint(path.stroke) and path.stroke_width > 0
    fill_visible = _has_paint(path.fill) and any(_can_fill(points) for points in subpaths)
    if not (stroke_visible or fill_visible):
        raise ValueError("The path must enclose a filled area or have a visible stroke.")
    return commands, bounds


def _build_path(path: VectorPath, origin: Point, scale: float, x: float, y: float) -> dict:
    commands, (left, top, right, bottom) = _path_geometry(path, origin, scale)
    width, height = right - left, bottom - top
    stroke_width = path.stroke_width * scale if path.stroke else 0
    if max(width, height) + stroke_width > MAX_PLACED_SIZE:
        raise ValueError("The placed path is too large.")
    obj = {
        "id": new_id(),
        "type": "path",
        "shapeKind": "path",
        "originX": "center",
        "originY": "center",
        "left": x + (left + right) / 2,
        "top": y + (top + bottom) / 2,
        "width": width,
        "height": height,
        "path": commands,
        "fill": path.fill,
        "fillRule": path.fill_rule,
        "stroke": path.stroke,
        "strokeWidth": stroke_width,
        "strokeUniform": True,
    }
    if path.name is not None:
        obj["name"] = path.name
    return obj


def build_vector(
    paths: Sequence[VectorPath],
    view_box: tuple[float, float, float, float],
    *,
    x: float,
    y: float,
    width: float,
) -> dict:
    """Place the view box at (x, y), retaining padding and the order of the supplied paths."""
    vx, vy, vw, vh = view_box
    scale = width / vw
    if max(width, vh * scale) > MAX_PLACED_SIZE:
        raise ValueError(f"The placed view box cannot exceed {MAX_PLACED_SIZE} px on either side.")
    children = []
    for index, path in enumerate(paths, 1):
        try:
            children.append(_build_path(path, (vx, vy), scale, x, y))
        except ValueError as exc:
            name = f" ({path.name!r})" if path.name else ""
            raise ValueError(f"Path {index}{name}: {exc}") from exc
    if len(children) == 1:
        return children[0]
    group = groups.group(children, new_id())
    if max(group["width"], group["height"]) > MAX_PLACED_SIZE:
        raise ValueError("The placed group is too large.")
    return group
