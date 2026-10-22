# Adds the sizes the built-in catalogue gained (print, documents, books, screens, app and web design, merch,
# logos, social platforms, advertising, stores, video calls, web and email) to sites that ran 0002 before them.
# Existing presets keep their edits; `manage.py seed_size_presets --update` also moves the old built-ins to their
# updated sizes, names and groups.

from django.db import migrations


def seed(apps, schema_editor):
    from apps.presets.importer import builtin_catalogue, write

    write(
        builtin_catalogue(),
        group_model=apps.get_model("presets", "SizePresetGroup"),
        preset_model=apps.get_model("presets", "SizePreset"),
        overwrite=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("presets", "0002_seed_builtin_presets"),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
