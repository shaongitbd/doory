from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.fonts.catalog import EDITOR_FONTS, SCRIPT_FONTS, curated_fonts
from apps.fonts.sources import FontSource, FontsourceSource, SourceError
from apps.fonts.sync import SyncOptions, import_font_directory, resolve_ids, sync_families


def _csv(value: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in value.split(",") if part.strip())


def _weights(value: str) -> tuple[int, ...]:
    try:
        weights = tuple(int(part) for part in _csv(value))
    except ValueError as exc:
        raise CommandError("--weights must be a comma-separated list such as 400,700.") from exc
    if not weights or any(w < 100 or w > 900 or w % 100 for w in weights):
        raise CommandError("--weights values must be 100, 200, … 900.")
    return weights


class Command(BaseCommand):
    help = (
        "Download open-licensed (OFL/Apache/Ubuntu) fonts from Fontsource via jsDelivr as woff2 into "
        "MEDIA_ROOT/fonts/system and register them. Idempotent and resumable: files already stored are "
        "skipped, so after an interruption just run the same command again."
    )

    def __init__(self, *args, source: FontSource | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._source = source

    def add_arguments(self, parser):
        parser.add_argument(
            "families", nargs="*", help='Family names or Fontsource ids, e.g. "Open Sans" lato.'
        )
        which = parser.add_mutually_exclusive_group()
        which.add_argument(
            "--all", action="store_true", help="Every Google-sourced family Fontsource offers."
        )
        which.add_argument(
            "--popular",
            type=int,
            metavar="N",
            help="The N most popular families (curated list), plus the editor's default fonts and one or two "
            "fonts for each of the main non-Latin scripts.",
        )
        which.add_argument(
            "--from-dir",
            metavar="DIR",
            help="Import already-downloaded <id>-<subset>-<weight>-<style>.woff2 files.",
        )
        parser.add_argument(
            "--subsets",
            default="auto",
            help="Comma-separated subsets, or auto (default): every script a family has (Arabic, Cyrillic, "
            "Devanagari, Hebrew…) except Chinese, Japanese and Korean.",
        )
        parser.add_argument(
            "--weights",
            default="300,400,500,600,700,800,900",
            help="Comma-separated weights (default: 300,400,500,600,700,800,900).",
        )
        parser.add_argument("--styles", default="normal,italic", help="normal and/or italic (default: both).")
        parser.add_argument(
            "--concurrency", type=int, default=4, help="Parallel downloads (default 4, max 8)."
        )
        parser.add_argument(
            "--license", default="OFL-1.1", help="Licence recorded for --from-dir imports (default OFL-1.1)."
        )

    def handle(self, *args, families=(), all=False, popular=None, from_dir=None, **options):
        if from_dir:
            return self._from_dir(Path(from_dir), options["license"])
        if popular is not None and popular < 1:
            raise CommandError("--popular needs a positive number.")
        if not (families or all or popular):
            raise CommandError("Name families, or pass --popular N, --all or --from-dir DIR.")
        styles = _csv(options["styles"])
        if not styles or not set(styles) <= {"normal", "italic"}:
            raise CommandError("--styles must be normal, italic or both.")
        subsets = _csv(options["subsets"])
        if not subsets:
            raise CommandError("--subsets needs at least one subset, e.g. latin.")
        opts = SyncOptions(
            subsets=subsets,
            weights=_weights(options["weights"]),
            styles=styles,
            concurrency=max(1, min(options["concurrency"], 8)),
        )
        source = self._source or FontsourceSource()
        ids = self._select(source, families, all, popular)

        weights = ",".join(map(str, opts.weights))
        self.stdout.write(
            f"Syncing {len(ids)} families (subsets {','.join(opts.subsets)}; weights {weights}; "
            f"styles {','.join(opts.styles)}; {opts.concurrency} at a time)."
        )
        report = sync_families(source, ids, opts, log=self.stdout.write)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done: {report.downloaded} files downloaded, {report.existing} already stored, "
                f"{len(report.failures)} failed, {len(report.skipped)} families skipped."
            )
        )
        if report.aborted:
            raise CommandError(
                f"{report.aborted}. Check your network or proxy settings (HTTPS_PROXY), or download the "
                "files elsewhere and import them with --from-dir. Progress is kept; run again to resume."
            )
        if report.failures:
            raise CommandError(
                f"{len(report.failures)} file(s) failed. Run the same command again to retry them."
            )

    def _select(self, source: FontSource, families, all_: bool, popular: int | None) -> list[str]:
        if popular:
            curated = curated_fonts()
            ids = [font.id for font in curated[:popular]]
            by_family = {font.family: font.id for font in curated}
            # The editor's own default faces come along whatever N is (see EDITOR_FONTS).
            extra = [by_family[name] for name in (*EDITOR_FONTS, *SCRIPT_FONTS) if name in by_family]
            return ids + [font_id for font_id in extra if font_id not in ids]
        if all_:
            try:
                available = source.list_ids()
            except SourceError as exc:
                raise CommandError(f"Could not list fonts: {exc}") from exc
            rank = {font.id: font.popularity for font in curated_fonts()}
            return sorted(available, key=lambda font_id: (rank.get(font_id, 10**6), font_id))
        return resolve_ids(families)

    def _from_dir(self, directory: Path, license_name: str) -> None:
        if not directory.is_dir():
            raise CommandError(f"{directory}: not a directory.")
        report = import_font_directory(directory, license_name=license_name, log=self.stdout.write)
        if not report.results:
            raise CommandError(
                "No files named <id>-<subset>-<weight>-<style>.woff2 were found (for example "
                "open-sans-latin-400-normal.woff2)."
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"Done: {report.downloaded} files imported, {report.existing} already stored, "
                f"{len(report.failures)} rejected."
            )
        )
        if report.failures:
            raise CommandError(f"{len(report.failures)} file(s) were rejected.")
