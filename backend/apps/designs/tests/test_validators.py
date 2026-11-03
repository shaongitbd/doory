import copy
import json

import pytest

from apps.designs.exceptions import DocumentTooLarge, InlineAssetNotAllowed, InvalidDocument
from apps.designs.validators import describe_document, validate_document

from .helpers import image_object, make_doc, text_object

LIMIT = 12 * 1024 * 1024


def check(doc, max_bytes=LIMIT):
    validate_document(doc, max_bytes=max_bytes)


def test_valid_document_passes():
    check(make_doc(pages=3, objects=[text_object(), image_object("https://cdn.example/a.png")]))
    check(make_doc(objects=[image_object("/media/assets/u/a.png")]))


@pytest.mark.parametrize(
    "doc",
    [
        None,
        [],
        "text",
        42,
        {},
        {"schemaVersion": "1"},
        {"schemaVersion": True, "width": 1, "height": 1, "pages": [{"id": "a", "objects": []}]},
    ],
)
def test_non_documents_rejected(doc):
    with pytest.raises(InvalidDocument):
        check(doc)


@pytest.mark.parametrize("version", [0, -1, 2, 99, 1.0, None])
def test_schema_version_bounds(version):
    doc = make_doc()
    doc["schemaVersion"] = version
    with pytest.raises(InvalidDocument):
        check(doc)


@pytest.mark.parametrize("key", ["width", "height"])
@pytest.mark.parametrize("value", [0, -5, 20_001, 1080.5, "800", None, True])
def test_dimension_bounds(key, value):
    doc = make_doc()
    doc[key] = value
    with pytest.raises(InvalidDocument):
        check(doc)


def test_dimension_edges_accepted():
    check(make_doc(width=1, height=20_000))


@pytest.mark.parametrize(
    "pages",
    [
        None,
        [],
        "x",
        {},
        [None],
        ["page"],
        [{"objects": []}],
        [{"id": "", "objects": []}],
        [{"id": 5, "objects": []}],
    ],
)
def test_pages_shape(pages):
    doc = make_doc()
    doc["pages"] = pages
    with pytest.raises(InvalidDocument):
        check(doc)


@pytest.mark.parametrize("key", ["width", "height"])
@pytest.mark.parametrize("value", [0, -5, 20_001, 336.5, "336", None, True, [336]])
def test_page_size_overrides_are_bounded_integers(key, value):
    doc = make_doc(pages=2)
    doc["pages"][1][key] = value
    with pytest.raises(InvalidDocument):
        check(doc)


def test_pages_of_different_sizes_are_accepted():
    doc = make_doc(pages=3)
    doc["pages"][1].update(width=794, height=1123)
    doc["pages"][2].update(width=1, height=20_000)
    check(doc)
    assert describe_document(doc).width == doc["width"]


def test_duplicate_page_ids_rejected():
    doc = make_doc(pages=2)
    doc["pages"][1]["id"] = doc["pages"][0]["id"]
    with pytest.raises(InvalidDocument):
        check(doc)


def test_page_count_limits():
    check(make_doc(pages=100))
    with pytest.raises(InvalidDocument):
        check(make_doc(pages=101))


def test_objects_must_be_a_bounded_list_of_objects():
    doc = make_doc()
    doc["pages"][0]["objects"] = "nope"
    with pytest.raises(InvalidDocument):
        check(doc)
    doc["pages"][0]["objects"] = [{"id": "a"}] * 5001
    with pytest.raises(InvalidDocument):
        check(doc)
    doc["pages"][0]["objects"] = [{"id": "a"}] * 5000
    check(doc)
    doc["pages"][0]["objects"] = [{"id": "a"}, "not-an-object"]
    with pytest.raises(InvalidDocument):
        check(doc)


def test_meta_must_be_an_object():
    doc = make_doc(meta="x")
    with pytest.raises(InvalidDocument):
        check(doc)


@pytest.mark.parametrize(
    "src",
    [
        "blob:https://app.example/1234-5678",
        "idb://3f2c1a52-0000-4000-8000-000000000000",
        "BLOB:null/abc",
        "  idb://x  ",
    ],
)
def test_local_references_rejected_anywhere(src):
    with pytest.raises(InlineAssetNotAllowed):
        check(make_doc(objects=[image_object(src)]))
    doc = make_doc()
    doc["pages"][0]["background"] = {"type": "image", "src": src, "fit": "cover"}
    with pytest.raises(InlineAssetNotAllowed):
        check(doc)
    nested = make_doc(objects=[{"id": "g", "type": "group", "objects": [{"id": "i", "src": src}]}])
    with pytest.raises(InlineAssetNotAllowed):
        check(nested)


def test_ordinary_text_that_mentions_the_schemes_is_fine():
    check(make_doc(objects=[text_object("blob: storage is great"), text_object("see idb://docs for more")]))


def test_small_data_urls_allowed_large_ones_not():
    small = "data:image/png;base64," + "A" * 1000
    check(make_doc(objects=[image_object(small)]))
    big = "data:image/png;base64," + "A" * (64 * 1024)
    with pytest.raises(InlineAssetNotAllowed):
        check(make_doc(objects=[image_object(big)]))
    with pytest.raises(InlineAssetNotAllowed):
        check(make_doc(objects=[image_object("DATA:image/png;base64," + "A" * (64 * 1024))]))


def test_long_text_embedding_base64_is_also_rejected():
    sneaky = "x" * 10 + ";base64," + "A" * (64 * 1024)
    with pytest.raises(InlineAssetNotAllowed):
        check(make_doc(objects=[{"id": "a", "type": "path", "d": sneaky}]))


def test_long_plain_text_is_fine():
    check(make_doc(objects=[text_object("word " * 20_000)]))


def test_depth_limit_is_enforced_iteratively():
    node: dict = {"id": "leaf"}
    for _ in range(5_000):
        node = {"id": "g", "child": node}
    with pytest.raises(InvalidDocument):
        check(make_doc(objects=[node]))


def test_depth_at_the_limit_is_accepted():
    node: dict = {"id": "leaf"}
    for _ in range(55):
        node = {"id": "g", "child": node}
    check(make_doc(objects=[node]))


def test_deeply_nested_lists_do_not_recurse_the_stack():
    deep: list = []
    for _ in range(200_000):
        deep = [deep]
    with pytest.raises(InvalidDocument):
        check(make_doc(objects=[{"id": "a", "deep": deep}]))


def test_node_budget(monkeypatch):
    monkeypatch.setattr("apps.designs.validators.MAX_NODES", 50)
    with pytest.raises(InvalidDocument):
        check(make_doc(objects=[text_object() for _ in range(20)]))


def test_size_limit_is_413():
    doc = make_doc(objects=[text_object("x" * 5_000)])
    size = len(json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode())
    check(doc, max_bytes=size)
    with pytest.raises(DocumentTooLarge):
        check(doc, max_bytes=size - 1)


def test_size_is_measured_in_utf8_bytes():
    doc = make_doc(objects=[text_object("é" * 1000)])
    utf8_size = len(json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode())
    assert len(json.dumps(doc, separators=(",", ":"))) > utf8_size + 1000
    check(doc, max_bytes=utf8_size)
    with pytest.raises(DocumentTooLarge):
        check(doc, max_bytes=utf8_size - 1)


@pytest.mark.parametrize("text", ["null \x00 byte", "\ud800 lone surrogate"])
def test_unstorable_text_is_rejected(text):
    with pytest.raises(InvalidDocument):
        check(make_doc(objects=[text_object(text)]))
    with pytest.raises(InvalidDocument):
        check(make_doc(objects=[{"id": "a", text: 1}]))


def test_unicode_text_is_fine():
    check(make_doc(objects=[text_object("こんにちは 🎨 مرحبا")]))


def test_unknown_object_properties_round_trip_untouched():
    doc = make_doc(objects=[{"id": "a", "type": "future", "weird": {"nested": [1, 2, {"x": None}]}}])
    before = copy.deepcopy(doc)
    check(doc)
    assert doc == before


def test_describe_document_derives_facts():
    info = describe_document(make_doc(pages=3, width=1200, height=628, meta={"presetId": "facebook-post"}))
    assert (info.width, info.height, info.page_count, info.preset) == (1200, 628, 3, "facebook-post")
    assert describe_document(make_doc()).preset == ""
    assert describe_document(make_doc(meta={"presetId": "x" * 65})).preset == ""
    assert describe_document(make_doc(meta={"presetId": 5})).preset == ""


@pytest.mark.parametrize("raw", ["1e999", "-1e999", "[1e999]", "[0, [-1e999]]"])
def test_numbers_beyond_the_float_range_are_refused(raw):
    """`1e999` is valid JSON that Python reads as infinity; the database cannot store it (it was a 500)."""
    document = make_doc(objects=[{"id": "o", "type": "rect"}])
    document["pages"][0]["objects"][0]["left"] = json.loads(raw)
    with pytest.raises(InvalidDocument, match="not finite"):
        check(document)


@pytest.mark.django_db
def test_such_a_number_in_a_request_body_is_a_400_not_a_500(api):
    design = api.post("/api/v1/designs/", {"title": "x"}, format="json").json()
    body = (
        '{"document":{"schemaVersion":1,"width":10,"height":10,"pages":[{"id":"a","objects":'
        '[{"id":"o","left":1e999}]}]},"base_revision":1}'
    )
    response = api.patch(f"/api/v1/designs/{design['id']}/", body, content_type="application/json")
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_document"
