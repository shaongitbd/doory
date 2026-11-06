"""What can be asked of a provider. A task fixes its input and output; providers, styles, quotas and the API
stay the same for every task, so a new one only adds an entry here."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass(frozen=True)
class Task:
    id: str  # also the URL segment: POST /api/v1/ai/{id}/
    label: str
    #: "image-alpha": an image with transparency; "image": any image.
    output: Literal["image-alpha", "image"]
    #: Appended to the source asset's name: "photo.jpg (no background)" (or to the prompt, for a text task).
    result_suffix: str
    #: "image": the task starts from one of the user's images; "prompt": from a line of text.
    input: Literal["image", "prompt"] = "image"
    #: Whether the result must have the source's size (a result of the same aspect ratio is scaled to it).
    same_size: bool = True
    #: JSON schema (the subset `validate_options` reads) of the task's options; empty: no options.
    options_schema: dict[str, Any] = field(default_factory=dict)


TASKS: dict[str, Task] = {
    "background-removal": Task(
        id="background-removal",
        label="Remove background",
        output="image-alpha",
        result_suffix="no background",
    ),
    "text-to-image": Task(
        id="text-to-image",
        label="Create image from text",
        output="image",
        result_suffix="created",
        input="prompt",
        same_size=False,
    ),
}

#: The longest prompt a text task accepts.
MAX_PROMPT_LENGTH = 2000


def get_task(task_id: str) -> Task | None:
    return TASKS.get(task_id)


def task_choices() -> list[tuple[str, str]]:
    return [(task.id, task.label) for task in TASKS.values()]


class InvalidOptions(ValueError):
    pass


_TYPES: dict[str, tuple[type, ...]] = {
    "string": (str,),
    "integer": (int,),
    "number": (int, float),
    "boolean": (bool,),
}


def validate_options(task: Task, options: Any) -> dict[str, Any]:
    """`options` checked against the task's schema (an object of scalar properties with optional `enum`,
    `minimum`, `maximum` and `maxLength`; unknown keys are refused). Raises InvalidOptions."""
    if options in (None, ""):
        options = {}
    if not isinstance(options, dict):
        raise InvalidOptions("Options must be an object.")
    properties: dict[str, dict[str, Any]] = task.options_schema.get("properties", {})
    unknown = sorted(set(options) - set(properties))
    if unknown:
        raise InvalidOptions(f"Unknown option: {unknown[0]}.")
    for name in task.options_schema.get("required", []):
        if name not in options:
            raise InvalidOptions(f"The option {name} is required.")
    for name, value in options.items():
        rule = properties[name]
        kinds = _TYPES.get(rule.get("type", "string"), (str,))
        if isinstance(value, bool) and bool not in kinds:  # True is an int to Python, not to JSON
            raise InvalidOptions(f"The option {name} has the wrong type.")
        if not isinstance(value, kinds):
            raise InvalidOptions(f"The option {name} has the wrong type.")
        if "enum" in rule and value not in rule["enum"]:
            raise InvalidOptions(f"The option {name} must be one of {', '.join(map(str, rule['enum']))}.")
        if "minimum" in rule and value < rule["minimum"]:
            raise InvalidOptions(f"The option {name} must be at least {rule['minimum']}.")
        if "maximum" in rule and value > rule["maximum"]:
            raise InvalidOptions(f"The option {name} must be at most {rule['maximum']}.")
        if isinstance(value, str) and len(value) > rule.get("maxLength", 1000):
            raise InvalidOptions(f"The option {name} is too long.")
    return dict(options)
