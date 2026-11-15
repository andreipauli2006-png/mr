# ER-диаграмма базы данных

10 таблиц, третья нормальная форма. Связи 1:N и M:N, индексы на полях поиска и внешних ключах.
Диаграмма в формате Mermaid — GitHub рисует её автоматически.

```mermaid
erDiagram
    users ||--o{ bookings : "создаёт"
    users ||--o{ refresh_tokens : "имеет"
    users ||--o{ password_reset_tokens : "имеет"
    users |o--o{ audit_logs : "выполняет"
    locations ||--o{ rooms : "содержит"
    rooms ||--o{ bookings : "бронируется"
    rooms ||--o{ room_photos : "имеет"
    rooms ||--o{ room_amenities : ""
    amenities ||--o{ room_amenities : ""

    users {
        int id PK
        varchar email UK "индекс"
        varchar password_hash "bcrypt"
        varchar full_name "индекс"
        enum role "guest | employee | admin"
        bool is_blocked
        timestamptz created_at
    }
    locations {
        int id PK
        varchar name UK
        varchar address
        timestamptz created_at
    }
    rooms {
        int id PK
        int location_id FK
        varchar name "индекс"
        text description
        int capacity "CHECK > 0, индекс"
        int floor
        bool is_active
        timestamptz created_at
    }
    amenities {
        int id PK
        varchar name UK
    }
    room_amenities {
        int room_id PK,FK
        int amenity_id PK,FK
    }
    room_photos {
        int id PK
        int room_id FK
        varchar file_name
        varchar content_type
        int size_bytes
        timestamptz created_at
    }
    bookings {
        int id PK
        int room_id FK
        int user_id FK
        varchar title "индекс"
        timestamptz start_at "индекс"
        timestamptz end_at "CHECK end_at > start_at"
        int attendees
        enum status "pending | confirmed | rejected | cancelled"
        timestamptz created_at
    }
    refresh_tokens {
        int id PK
        int user_id FK
        varchar token_hash UK "SHA-256"
        timestamptz expires_at
        bool revoked
    }
    password_reset_tokens {
        int id PK
        int user_id FK
        varchar token_hash UK
        timestamptz expires_at
        bool used
    }
    audit_logs {
        int id PK
        int user_id FK "nullable"
        varchar action "индекс"
        varchar entity
        int entity_id
        jsonb details
        timestamptz created_at
    }
```

## Ограничения целостности

| Ограничение | Таблица | Зачем |
|---|---|---|
| `bookings_no_overlap` — `EXCLUDE USING gist (room_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE status IN ('pending','confirmed')` | bookings | в одном зале не может быть двух активных броней на пересекающееся время |
| `bookings_time_order` — `CHECK (end_at > start_at)` | bookings | окончание позже начала |
| `rooms_capacity_positive` — `CHECK (capacity > 0)` | rooms | вместимость положительная |
| `ON DELETE RESTRICT` | rooms.location_id | нельзя удалить локацию, в которой есть залы |
| `ON DELETE CASCADE` | bookings, room_photos, room_amenities, tokens | при удалении зала/пользователя удаляются зависимые записи |
| `ON DELETE SET NULL` | audit_logs.user_id | журнал сохраняется после удаления пользователя |

## Почему 3НФ

- нет повторяющихся групп: удобства вынесены в отдельный справочник и связаны через `room_amenities`;
- каждый неключевой атрибут зависит только от ключа: адрес хранится в `locations`, а не в каждом зале;
- нет транзитивных зависимостей: в броне хранится только `room_id`, название зала берётся через связь.

Все изменения схемы — только через миграции Alembic (`backend/alembic/versions`).
