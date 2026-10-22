"""`manage.py check` warnings for the image optimizer settings."""

from __future__ import annotations

from urllib.parse import urlsplit

from django.conf import settings
from django.core.checks import Tags, Warning, register

from . import optimizers
from .optimizers.builtin import cjpeg, oxipng
from .optimizers.custom import key_problem, url_problem

_NEEDS = {
    "tinypng": "TINYPNG_API_KEY",
    "kraken": "KRAKEN_API_KEY and KRAKEN_API_SECRET",
}


@register(Tags.security)
def check_image_optimizers(app_configs, **kwargs):
    issues = []
    names = [str(name).strip().lower() for name in settings.IMAGE_OPTIMIZERS if str(name).strip()]
    for name in names:
        if name not in optimizers.OPTIMIZERS:
            issues.append(
                Warning(
                    f"IMAGE_OPTIMIZERS: unknown optimizer {name!r}; it is left out.",
                    hint="Use " + ", ".join(optimizers.OPTIMIZERS) + ".",
                    id="exports.W001",
                )
            )
    listed = optimizers.listed()
    if "builtin" in listed and not (cjpeg() and oxipng()):
        missing = " and ".join(
            program for program, found in (("mozjpeg (cjpeg)", cjpeg()), ("oxipng", oxipng())) if not found
        )
        issues.append(
            Warning(
                f"IMAGE_OPTIMIZERS: the built-in optimizer can't find {missing}"
                + (
                    "; it is left out."
                    if not optimizers.OPTIMIZERS["builtin"].ready()
                    else "; those files are left as they are."
                ),
                hint="The Docker image installs both (INSTALL_IMAGE_OPTIMIZERS=true).",
                id="exports.W002",
            )
        )
    for name, needs in _NEEDS.items():
        if name in listed and not optimizers.OPTIMIZERS[name].ready():
            issues.append(
                Warning(
                    f"IMAGE_OPTIMIZERS lists {name} but {needs} is not set; it is left out.",
                    id="exports.W003",
                )
            )
    if "custom" in listed:
        url = settings.IMAGE_OPTIMIZER_CUSTOM_URL.strip()
        problem = (
            "it is not set"
            if not url
            else url_problem(url) or key_problem(settings.IMAGE_OPTIMIZER_CUSTOM_KEY)
        )
        if problem:
            issues.append(
                Warning(
                    f"IMAGE_OPTIMIZER_CUSTOM_URL: {problem.rstrip('.')}; the custom optimizer is left out.",
                    id="exports.W003",
                )
            )
        elif settings.IMAGE_OPTIMIZER_CUSTOM_KEY.strip() and urlsplit(url).scheme.lower() == "http":
            issues.append(
                Warning(
                    "IMAGE_OPTIMIZER_CUSTOM_URL is a plain http:// address: IMAGE_OPTIMIZER_CUSTOM_KEY and "
                    "the images are sent to it unencrypted.",
                    hint="Use an https:// address, or no key for an optimizer on your own private network.",
                    id="exports.W005",
                )
            )
    default = str(settings.IMAGE_OPTIMIZER_DEFAULT).strip().lower()
    if default and listed and default not in listed:  # a listed one that can't run is reported above
        issues.append(
            Warning(
                f"IMAGE_OPTIMIZER_DEFAULT={default!r} is not in IMAGE_OPTIMIZERS; exports with optimize=true "
                "are not optimized.",
                hint="Pick one of IMAGE_OPTIMIZERS, or leave it empty.",
                id="exports.W004",
            )
        )
    return issues
