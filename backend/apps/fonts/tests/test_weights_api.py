import pytest
from django.core.cache import cache

from apps.fonts.models import FontFamily
from apps.fonts.views import offered_weights

from .fakes import FakeSource, meta

pytestmark = pytest.mark.django_db
URL = "/api/v1/fonts/weights/"


def test_only_a_signed_in_user_can_add_a_weight(client, settings, monkeypatch):
    settings.FONT_ON_DEMAND_ENABLED = True
    source = FakeSource(meta("roboto", "Roboto", subsets=("latin",), weights=(300, 400), styles=("normal",)))
    monkeypatch.setattr("apps.fonts.views.FontsourceSource", lambda: source)
    assert client.get(URL, {"family": "Roboto"}).json() == {"enabled": False, "weights": []}
    response = client.post(
        URL, {"family": "Roboto", "weight": 300, "style": "normal"}, content_type="application/json"
    )
    assert response.status_code in (401, 403)
    assert source.fetched == []


def test_downloads_can_be_disabled_by_an_admin(auth_client, settings):
    client = auth_client
    settings.FONT_ON_DEMAND_ENABLED = False
    assert client.get(URL, {"family": "Roboto"}).json() == {"enabled": False, "weights": []}
    assert (
        client.post(
            URL, {"family": "Roboto", "weight": 300, "style": "normal"}, content_type="application/json"
        ).status_code
        == 403
    )


def test_only_source_variants_can_be_added(auth_client, settings, monkeypatch):
    client = auth_client
    settings.FONT_ON_DEMAND_ENABLED = True
    cache.clear()
    source = FakeSource(
        meta("roboto", "Roboto", subsets=("latin",), weights=(300, 400, 700), styles=("normal",))
    )
    monkeypatch.setattr("apps.fonts.views.FontsourceSource", lambda: source)

    offered = client.get(URL, {"family": "Roboto"})
    assert offered.status_code == 200
    assert offered.json()["weights"] == [
        {"weight": 300, "style": "normal"},
        {"weight": 400, "style": "normal"},
        {"weight": 700, "style": "normal"},
    ]
    bad = client.post(
        URL, {"family": "Roboto", "weight": 500, "style": "normal"}, content_type="application/json"
    )
    assert bad.status_code == 400 and source.fetched == []

    added = client.post(
        URL, {"family": "Roboto", "weight": 300, "style": "normal"}, content_type="application/json"
    )
    assert added.status_code == 200
    assert [(v["weight"], v["style"]) for v in added.json()["variants"]] == [(300, "normal")]
    assert source.fetched == [("roboto", "latin", 300, "normal")]
    assert FontFamily.objects.get(slug="roboto").license == "OFL-1.1"


def test_unknown_and_unlicensed_families_are_not_downloaded(auth_client, settings, monkeypatch):
    client = auth_client
    settings.FONT_ON_DEMAND_ENABLED = True
    cache.clear()
    source = FakeSource(meta("roboto", "Roboto", license="proprietary", subsets=("latin",)))
    monkeypatch.setattr("apps.fonts.views.FontsourceSource", lambda: source)
    assert client.get(URL, {"family": "Arial"}).status_code == 404
    assert client.get(URL, {"family": "Roboto"}).status_code == 404
    assert (
        client.post(
            URL, {"family": "Roboto", "weight": 400, "style": "normal"}, content_type="application/json"
        ).status_code
        == 404
    )
    assert source.fetched == []


def test_only_importable_subsets_and_standard_weights_are_offered():
    family = meta(
        "roboto",
        "Roboto",
        subsets=("latin", "japanese"),
        weights=(400, 450, 700),
        styles=("normal",),
        available=frozenset({(400, "normal", "latin"), (700, "normal", "japanese")}),
    )
    assert offered_weights(family) == [(400, "normal")]
