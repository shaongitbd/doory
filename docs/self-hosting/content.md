# Content

A new site starts empty: no templates, no icons or illustrations, only the system fonts and no
background-removal model. Add content with the commands below once the site is running. You can also set the
matching option in `.env` and have the API container add it each time it starts.

Commands are shown for Docker. Without Docker, use the `manage` helper from [manual.md](manual.md).

## First-run content

| What | Command | Option in `.env` | Size and time |
|------|---------|------------------|---------------|
| Template categories | `docker compose exec api python manage.py seed_gallery` | | instant |
| Fonts (open-licensed) | `… sync_fonts --popular 100` (or `--popular 253`, `--all`) | `DOORY_SYNC_FONTS`, `DOORY_SYNC_FONTS_ARGS` (once) | about 6 MB for 100 families |
| Starter templates | `… seed_templates` (`--update` refreshes them) | `DOORY_SEED_TEMPLATES` | needs the fonts first |
| Shapes and graphics | `… seed_elements` | `DOORY_SYNC_ELEMENTS` | instant |
| Icons, emoji, illustrations | `… sync_element_packs` (`--pack <name>` for some packs only) | `DOORY_SYNC_ELEMENTS`, `DOORY_SYNC_ELEMENTS_ARGS` | about 27,500 elements, 120–130 MB, about 40 s the first time |
| Background-removal model | `… sync_models` (`--model <name>`, `--all`) | `DOORY_SYNC_MODELS`, `DOORY_SYNC_MODELS_ARGS` | 4.6 MB by default |
| Music and sound effects | `… sync_audio` (`--pack <name>` for extra packs) | `DOORY_SYNC_AUDIO`, `DOORY_SYNC_AUDIO_ARGS` | about 7 MB, comes with the image |

With the `.env` options, the downloads run before the API starts serving, so the first start can take several
minutes. Compose shows the API as unhealthy until they finish. A failed download is logged and the server starts
anyway. For a first install it's often easier to run the commands by hand, then turn the options on for later
starts.

Every command can be run again. The ones that run on every start only check what's already installed, so a
restart doesn't download anything twice.

### Brand logos

The icon sets include brand logos (social networks, video platforms, …). They're trademarks of their owners, so
they're left out by default. Set `DOORY_ELEMENTS_BRAND_LOGOS=true` and the next `sync_element_packs` adds them,
tagged `brand` and `logo`. Setting it back to `false` unpublishes them on the next sync; designs that already use
a logo keep their copy.

### Your own templates

Staff add and edit templates in the admin site. `manage.py import_template` imports a template from a file.

## Size presets

The sizes in the Create and Resize dialogs come from the server. A new site has about 1,600 built-in sizes:
presentations, print (paper, cards, flyers and posters, photo prints and labels), documents, books, video and screens,
app and web design, web and email, merch, logos and icons, and sizes for social media, advertising, stores and video
calls. [size-preset-sources.md](size-preset-sources.md) lists where each size comes from. You can add your own,
or offer only yours:

| Way | How |
|-----|-----|
| Admin site | **Size presets**: groups (nested to any depth) and presets. Drag to reorder and switch them on or off |
| A JSON file, once | `docker compose exec api python manage.py import_size_presets sizes.json`. A folder imports every `.json` file in it; `--dry-run` only checks |
| A JSON file, on every start | Mount the file into the API container and set `DOORY_SIZE_PRESETS_FILE` to its path (see `docker-compose.yml`) |

`extend` (the default, also `DOORY_SIZE_PRESETS_MODE=extend`) adds the file's sizes to the built-in ones; a preset
with the same slug replaces the built-in one. `replace` offers only the file's sizes and switches the others off
without deleting them. The import is matched on slugs, so you can edit the file and import it again.

```json
{
  "version": 1,
  "groups": [
    {
      "slug": "social", "label": "Social media",
      "children": [
        {
          "slug": "platform-a", "label": "Platform A",
          "presets": [
            { "slug": "platform-a-portrait", "label": "Portrait post", "width": 1000, "height": 1250, "unit": "px",
              "tags": ["4:5"], "is_quick": true, "meta": { "safe_zone": { "top": 0.1, "bottom": 0.2 } } }
          ]
        }
      ]
    },
    {
      "slug": "print", "label": "Print",
      "presets": [{ "slug": "flyer-a6", "label": "Flyer (A6)", "width": 105, "height": 148, "unit": "mm" }]
    }
  ]
}
```

A preset needs `slug`, `label`, `width` and `height`. `unit` is `px` (the default), `mm`, `cm` or `in`. Optional
fields:

- `icon`: a [Lucide](https://lucide.dev/icons) icon name
- `tags`: searchable, and shown as filters
- `aliases`: old slugs that still mean this preset
- `is_quick`: one of the popular sizes. Until someone pins sizes of their own (the star on a size in the picker),
  these are their sizes on the home page and at the top of the picker
- `is_active` and `order`
- `meta`: `safe_zone` holds the fraction of the page to keep clear on each side

Groups take `slug`, `label`, `icon`, `order`, `is_active`, `children` and `presets`.

`GET /api/v1/size-presets/` returns the current presets in the same format, so you can save them, edit them and
import them again. `manage.py seed_size_presets --update` resets the built-in sizes.
