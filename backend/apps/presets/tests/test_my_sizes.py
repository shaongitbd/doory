import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.designs.tests.helpers import make_design
from apps.presets.models import SizeChoices

pytestmark = pytest.mark.django_db

URL = "/api/v1/size-presets/mine/"


@pytest.fixture
def user():
    return User.objects.create_user(email="alice@example.com", password="pw-123456789")


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_needs_a_signed_in_person():
    assert APIClient().get(URL).status_code in (401, 403)


def test_starts_with_the_popular_sizes_and_nothing_folded(api):
    assert api.get(URL).json() == {"pinned": None, "recent": [], "collapsed": []}


def test_pins_and_folds_are_saved_per_person(api, user):
    res = api.patch(URL, {"pinned": ["a4", "instagram-post", "a4"], "collapsed": ["social"]}, format="json")
    assert res.status_code == 200
    assert res.json()["pinned"] == ["a4", "instagram-post"]  # each once, in the order given
    assert res.json()["collapsed"] == ["social"]
    other = User.objects.create_user(email="bob@example.com", password="pw-123456789")
    client = APIClient()
    client.force_authenticate(other)
    assert client.get(URL).json()["pinned"] is None

    # One field at a time leaves the other alone; null goes back to the popular sizes.
    assert api.patch(URL, {"collapsed": []}, format="json").json()["pinned"] == ["a4", "instagram-post"]
    assert api.patch(URL, {"pinned": None}, format="json").json()["pinned"] is None
    assert SizeChoices.objects.get(user=user).collapsed == []


@pytest.mark.parametrize(
    "body",
    [
        {"pinned": "a4"},
        {"pinned": ["a4", 3]},
        {"pinned": ["bad slug"]},
        {"pinned": [f"size-{n}" for n in range(25)]},
        {"collapsed": ["Social Media"]},
    ],
)
def test_rejects_what_is_not_a_short_list_of_slugs(api, body):
    res = api.patch(URL, body, format="json")
    assert res.status_code == 400
    # The standard error format, naming the field.
    assert list(res.json()["error"]["fields"]) == list(body)


def test_recent_sizes_come_from_the_latest_designs_each_once(api, user):
    for preset in ["a4", "instagram-post", "a4", "", "poster"]:
        make_design(user, preset=preset)
    make_design(user, preset="logo", trashed_at=timezone.now())
    assert api.get(URL).json()["recent"] == ["poster", "a4", "instagram-post"]
