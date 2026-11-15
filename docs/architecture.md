# Архитектура

Клиент-серверное приложение: SPA на React обращается к REST API на FastAPI, данные хранятся в PostgreSQL.

## Компоненты

```mermaid
flowchart LR
    U[Пользователь<br/>браузер] -->|HTTPS| N[Nginx<br/>статика SPA + прокси]
    N -->|/api/*| B[FastAPI<br/>REST API]
    N -->|/| S[(React SPA<br/>сборка Vite)]
    B -->|SQLAlchemy| DB[(PostgreSQL)]
    B -->|файлы| F[(Том uploads<br/>фото залов)]
    GH[GitHub Actions<br/>CI] -.->|lint → test → build| B
```

В docker compose это три контейнера: `db`, `backend`, `frontend` (Nginx).
На бесплатном хостинге — один контейнер: FastAPI сам отдаёт собранный фронтенд (`Dockerfile` в корне).

## Слои бэкенда

```mermaid
flowchart TB
    R[routers<br/>контроллеры: HTTP, валидация входа, коды ответов] --> S[services<br/>бизнес-логика: правила брони, авторизация, отчёты]
    S --> RP[repositories<br/>запросы к БД: фильтры, сортировка, пагинация]
    RP --> M[models<br/>ORM-таблицы]
    R -.-> SC[schemas<br/>Pydantic: вход/выход API]
    R -.-> C[core<br/>настройки, JWT, bcrypt, RBAC, ошибки]
```

- **routers** — только принимают запрос и вызывают сервис; бизнес-логики в контроллерах нет;
- **services** — правила предметной области (например, `validate_booking_time`, `can_change_status`), покрыты unit-тестами;
- **repositories** — все SQL-запросы через ORM с параметрами;
- **core/deps.py** — `get_current_user`, `require_roles(...)` для проверки прав на сервере;
- **core/errors.py** — единый формат ошибок `{"error": {"code", "message", "details"}}`.

## Слои фронтенда

| Папка | Назначение |
|---|---|
| `api/` | axios-клиент с автообновлением токена, типы, функции запросов |
| `auth/` | контекст текущего пользователя, защищённые маршруты |
| `components/` | UI-kit: таблица броней, календарь слотов, диалоги, состояния загрузки/пустого списка/ошибки |
| `pages/` | страницы; админские грузятся лениво отдельным файлом |
| `utils/` | расчёт слотов, форматирование, правила валидации |

Серверные данные кэширует TanStack Query; после изменений связанные запросы инвалидируются.

## Авторизация

```mermaid
sequenceDiagram
    participant F as Фронтенд
    participant A as API
    participant D as БД
    F->>A: POST /auth/login (email, пароль)
    A->>D: найти пользователя, сверить bcrypt-хэш
    A->>D: сохранить хэш refresh-токена
    A-->>F: access (15 мин) + refresh (7 дней)
    F->>A: запросы с Authorization: Bearer access
    A-->>F: 401, когда access истёк
    F->>A: POST /auth/refresh (refresh)
    A->>D: старый refresh отозвать, выдать новую пару
    A-->>F: новые токены, запрос повторяется автоматически
```

## Бронирование: защита от пересечений

1. Сервис проверяет правила (время, длительность, вместимость) и наличие пересечения → `409 Conflict`.
2. Если два запроса пришли одновременно и оба прошли проверку, вторую вставку отклонит
   ограничение `EXCLUDE` в PostgreSQL → сервис превращает ошибку БД в тот же `409`.
