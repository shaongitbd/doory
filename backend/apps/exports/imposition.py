"""Page pairs for folded PDF sheets. Indexes refer to the selected pages."""

from dataclasses import dataclass

from .exceptions import InvalidExport
from .layout import PX_PER_MM


@dataclass(frozen=True)
class SheetSide:
    left: int | None
    right: int | None
    sheet: int
    signature: int
    side: str


def _at(start: int, length: int, offset: int) -> int | None:
    return start + offset if offset < length else None


def folded_sheet(width: float, height: float) -> tuple[float, float, float, float]:
    """Exact A4 for A5 leaves, otherwise a sheet twice the leaf width."""
    a5 = abs(width - 148 * PX_PER_MM) < 2 and abs(height - 210 * PX_PER_MM) < 2
    sheet_width = 297 * PX_PER_MM if a5 else width * 2
    sheet_height = 210 * PX_PER_MM if a5 else height
    return sheet_width, sheet_height, (sheet_width - width * 2) / 2, (sheet_height - height) / 2


def impose_pages(count: int, layout: str, signature_pages: int, binding: str) -> list[SheetSide]:
    if count < 1 or layout not in {"booklet", "book"} or binding not in {"left", "right"}:
        raise InvalidExport("invalid_imposition", "Choose pages, a folded layout and a binding direction.")
    if layout == "book" and (signature_pages < 4 or signature_pages > 32 or signature_pages % 4):
        raise InvalidExport("invalid_imposition", "Signature size must be a multiple of four from 4 to 32.")
    group_size = (count + 3) // 4 * 4 if layout == "booklet" else signature_pages
    result = []
    for start in range(0, count, group_size):
        length = min(group_size, count - start)
        padded = (length + 3) // 4 * 4

        for outer in range(padded // 4):
            first, last = outer * 2, padded - 1 - outer * 2
            sheet = len(result) // 2
            pairs = (
                ("front", _at(start, length, last), _at(start, length, first)),
                ("back", _at(start, length, first + 1), _at(start, length, last - 1)),
            )
            for side, left, right in pairs:
                if binding == "right":
                    left, right = right, left
                result.append(SheetSide(left, right, sheet, start // group_size + 1, side))
    return result


def validate_fold(
    sizes,
    layout: str,
    signature_pages: int,
    binding: str,
    bleed_mm: float,
    crop_marks: bool,
    print_sides: str = "both",
):
    """Return the sheet plan, or reject combinations that cannot fit at their true size."""
    if print_sides not in {"both", "front", "back"}:
        raise InvalidExport("invalid_imposition", "Choose both, front or back sheet sides.")
    if layout == "normal":
        if print_sides != "both":
            raise InvalidExport("invalid_imposition", "Sheet sides require a folded layout.")
        return None
    if bleed_mm or crop_marks:
        raise InvalidExport(
            "invalid_imposition", "Folded sheets cannot use bleed or crop marks at this paper size."
        )
    width, height = sizes[0]
    if width >= height or any(size != (width, height) for size in sizes):
        raise InvalidExport("invalid_imposition", "Folded sheets need portrait pages of one size.")
    sides = impose_pages(len(sizes), layout, signature_pages, binding)
    return sides if print_sides == "both" else [side for side in sides if side.side == print_sides]
