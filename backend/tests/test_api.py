"""Интеграционные тесты API на тестовой PostgreSQL."""

from io import BytesIO

from openpyxl import load_workbook

from tests.conftest import PASSWORD, future_slot


# ---------- авторизация ----------
def test_register_login_refresh_logout(client):
    r = client.post("/api/auth/register", json={"email": "new@test.ru", "password": "Qwerty123", "full_name": "Новый"})
    assert r.status_code == 201
    assert r.json()["role"] == "guest"

    r = client.post("/api/auth/login", json={"email": "new@test.ru", "password": "Qwerty123"})
    assert r.status_code == 200
    tokens = r.json()

    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["email"] == "new@test.ru"

    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    # старый refresh больше не работает (ротация)
    r2 = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r2.status_code == 401

    new_refresh = r.json()["refresh_token"]
    assert client.post("/api/auth/logout", json={"refresh_token": new_refresh}).status_code == 204
    assert client.post("/api/auth/refresh", json={"refresh_token": new_refresh}).status_code == 401


def test_register_duplicate_email(client, users):
    r = client.post(
        "/api/auth/register", json={"email": "admin@test.ru", "password": "Qwerty123", "full_name": "Дубль"}
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "conflict"


def test_login_wrong_password(client, users):
    r = client.post("/api/auth/login", json={"email": "admin@test.ru", "password": "nope12345"})
    assert r.status_code == 401


def test_validation_error_format(client):
    r = client.post("/api/auth/register", json={"email": "bad", "password": "1", "full_name": ""})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "validation_error"
    assert {d["field"] for d in body["details"]} >= {"email", "password", "full_name"}


def test_password_reset_flow(client, users, caplog):
    client.post("/api/auth/forgot-password", json={"email": "guest@test.ru"})
    link = next(r.getMessage() for r in caplog.records if "reset-password" in r.getMessage())
    token = link.split("token=")[1]
    r = client.post("/api/auth/reset-password", json={"token": token, "new_password": "NewPass123"})
    assert r.status_code == 204
    assert client.post("/api/auth/login", json={"email": "guest@test.ru", "password": "NewPass123"}).status_code == 200
    # ссылка одноразовая
    assert (
        client.post("/api/auth/reset-password", json={"token": token, "new_password": "Other1234"}).status_code == 422
    )


def test_blocked_user_cannot_login(client, users, headers):
    uid = users["guest"].id
    r = client.patch(f"/api/admin/users/{uid}", json={"is_blocked": True}, headers=headers["admin"])
    assert r.status_code == 200
    assert client.post("/api/auth/login", json={"email": "guest@test.ru", "password": PASSWORD}).status_code == 403


# ---------- RBAC: права проверяются на сервере ----------
def test_non_admin_cannot_manage(client, headers, room):
    body = {"location_id": room.location_id, "name": "Новый", "capacity": 4}
    assert client.post("/api/rooms", json=body, headers=headers["employee"]).status_code == 403
    assert client.post("/api/rooms", json=body).status_code == 401
    assert client.get("/api/admin/users", headers=headers["guest"]).status_code == 403
    assert client.get("/api/admin/dashboard", headers=headers["employee"]).status_code == 403
    assert client.post("/api/rooms", json=body, headers=headers["admin"]).status_code == 201


def test_user_cannot_see_foreign_booking(client, headers, room):
    s, e = future_slot()
    b = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Моё", "start_at": s, "end_at": e},
        headers=headers["employee"],
    ).json()
    assert client.get(f"/api/bookings/{b['id']}", headers=headers["employee2"]).status_code == 404
    r = client.patch(f"/api/bookings/{b['id']}/status", json={"status": "cancelled"}, headers=headers["employee2"])
    assert r.status_code == 404
    assert client.get(f"/api/bookings/{b['id']}", headers=headers["admin"]).status_code == 200


# ---------- бронирование ----------
def test_booking_overlap_rejected(client, headers, room):
    s, e = future_slot(hour=10, hours=2)
    r1 = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Первая", "start_at": s, "end_at": e},
        headers=headers["employee"],
    )
    assert r1.status_code == 201
    assert r1.json()["status"] == "confirmed"

    s2, e2 = future_slot(hour=11, hours=1)  # пересекается с первой
    r2 = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Вторая", "start_at": s2, "end_at": e2},
        headers=headers["employee2"],
    )
    assert r2.status_code == 409

    s3, e3 = future_slot(hour=12, hours=1)  # сразу после — можно
    r3 = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Третья", "start_at": s3, "end_at": e3},
        headers=headers["employee2"],
    )
    assert r3.status_code == 201


def test_guest_booking_needs_approval(client, headers, room):
    s, e = future_slot()
    r = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Заявка", "start_at": s, "end_at": e},
        headers=headers["guest"],
    )
    assert r.json()["status"] == "pending"
    bid = r.json()["id"]
    assert (
        client.patch(f"/api/bookings/{bid}/status", json={"status": "confirmed"}, headers=headers["guest"]).status_code
        == 403
    )
    r = client.patch(f"/api/bookings/{bid}/status", json={"status": "confirmed"}, headers=headers["admin"])
    assert r.json()["status"] == "confirmed"


def test_cancelled_slot_becomes_free(client, headers, room):
    s, e = future_slot()
    b = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Отменю", "start_at": s, "end_at": e},
        headers=headers["employee"],
    ).json()
    client.patch(f"/api/bookings/{b['id']}/status", json={"status": "cancelled"}, headers=headers["employee"])
    r = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Займу", "start_at": s, "end_at": e},
        headers=headers["employee2"],
    )
    assert r.status_code == 201


def test_capacity_limit(client, headers, room):
    s, e = future_slot()
    r = client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Толпа", "start_at": s, "end_at": e, "attendees": 50},
        headers=headers["employee"],
    )
    assert r.status_code == 422


def test_slots_endpoint_public(client, headers, room):
    s, e = future_slot()
    client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Встреча", "start_at": s, "end_at": e},
        headers=headers["employee"],
    )
    day = s[:10]
    r = client.get(f"/api/rooms/{room.id}/slots", params={"day": day})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert "title" not in r.json()[0]  # чужие данные не раскрываются


# ---------- списки, поиск, пагинация ----------
def test_rooms_search_filter_sort_pagination(client, headers, room):
    for i in range(5):
        client.post(
            "/api/rooms",
            json={"location_id": room.location_id, "name": f"Зал {i}", "capacity": 10 + i},
            headers=headers["admin"],
        )
    r = client.get("/api/rooms", params={"size": 2, "page": 2, "sort": "-capacity"}).json()
    assert r["total"] == 6 and len(r["items"]) == 2
    assert r["items"][0]["capacity"] == 12

    r = client.get("/api/rooms", params={"search": "зал 3"}).json()
    assert [x["name"] for x in r["items"]] == ["Зал 3"]

    r = client.get("/api/rooms", params={"min_capacity": 13}).json()
    assert r["total"] == 2

    amenity_id = room.amenities[0].id if room.amenities else 1
    r = client.get("/api/rooms", params={"amenity_ids": amenity_id}).json()
    assert [x["name"] for x in r["items"]] == ["Альфа"]


def test_admin_users_list_search(client, headers):
    r = client.get("/api/admin/users", params={"search": "employee", "sort": "email"}, headers=headers["admin"])
    assert [u["email"] for u in r.json()["items"]] == ["employee2@test.ru", "employee@test.ru"]


# ---------- файлы, экспорт, аудит, дашборд ----------
def test_upload_photo(client, headers, room):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 50
    r = client.post(
        f"/api/rooms/{room.id}/photos", files={"file": ("a.png", png, "image/png")}, headers=headers["admin"]
    )
    assert r.status_code == 201
    assert client.get(r.json()["url"]).content == png

    bad = client.post(
        f"/api/rooms/{room.id}/photos",
        files={"file": ("a.exe", b"MZ", "application/x-msdownload")},
        headers=headers["admin"],
    )
    assert bad.status_code == 422


def test_export_xlsx_and_audit(client, headers, room):
    s, e = future_slot()
    client.post(
        "/api/bookings",
        json={"room_id": room.id, "title": "Экспорт", "start_at": s, "end_at": e},
        headers=headers["employee"],
    )
    r = client.get("/api/bookings/export.xlsx", headers=headers["admin"])
    assert r.status_code == 200
    ws = load_workbook(BytesIO(r.content)).active
    assert ws.cell(2, 3).value == "Экспорт"

    audit = client.get("/api/admin/audit", params={"action": "booking.create"}, headers=headers["admin"]).json()
    assert audit["total"] == 1

    dash = client.get("/api/admin/dashboard", headers=headers["admin"]).json()
    assert dash["total_rooms"] == 1 and len(dash["by_day"]) == 14


def test_room_update_and_delete(client, headers, room):
    body = {"location_id": room.location_id, "name": "Альфа 2", "capacity": 8, "is_active": False}
    r = client.put(f"/api/rooms/{room.id}", json=body, headers=headers["admin"])
    assert r.status_code == 200 and r.json()["capacity"] == 8
    # неактивный зал скрыт от обычных пользователей
    assert client.get(f"/api/rooms/{room.id}").status_code == 404
    assert client.delete(f"/api/rooms/{room.id}", headers=headers["admin"]).status_code == 204


def test_profile_and_change_password(client, headers):
    r = client.patch("/api/users/me", json={"full_name": "Новое Имя"}, headers=headers["employee"])
    assert r.json()["full_name"] == "Новое Имя"
    bad = client.post(
        "/api/auth/change-password",
        json={"old_password": "wrong", "new_password": "NewPass123"},
        headers=headers["employee"],
    )
    assert bad.status_code == 422
    ok = client.post(
        "/api/auth/change-password",
        json={"old_password": PASSWORD, "new_password": "NewPass123"},
        headers=headers["employee"],
    )
    assert ok.status_code == 204
    hist = client.get("/api/users/me/history", headers=headers["employee"]).json()
    assert {i["action"] for i in hist["items"]} >= {"user.profile_update", "user.password_change"}
