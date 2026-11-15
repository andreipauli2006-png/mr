# MeetSpace — бронирование переговорных и коворкингов

Fullstack веб-приложение для бронирования переговорных комнат и рабочих мест.
Учебная практика, специальность 09.02.07 «Информационные системы и программирование».

**Ключевая особенность:** календарь свободных слотов по 30 минут и запрет пересечения броней —
двойная защита: проверка в сервисе и ограничение `EXCLUDE` на уровне PostgreSQL
(даже два одновременных запроса не смогут занять одно время).

- **Публичная ссылка: https://meetspace-xgyx.onrender.com**
- Документация API (Swagger): https://meetspace-xgyx.onrender.com/api/docs
- Репозиторий: https://github.com/andreipauli2006-png/mr

## Роли

| Роль | Что может |
|---|---|
| **Гость** (выдаётся при регистрации) | смотреть залы и расписание, оставлять заявки на бронь — они ждут подтверждения администратора |
| **Сотрудник** | бронировать залы сразу, без подтверждения; отменять свои брони |
| **Администратор** | управлять залами, локациями, фото; подтверждать/отклонять заявки; менять роли и блокировать пользователей; дашборд, журнал действий, экспорт |

Права проверяются **на сервере** (`app/core/deps.py → require_roles`), а не только скрытием кнопок.

## Тестовые учётные записи

Создаются автоматически при первом запуске (`app/seed.py`):

| Роль | Email | Пароль |
|---|---|---|
| Администратор | admin@meetspace.ru | Admin12345 |
| Сотрудник | employee@meetspace.ru | Employee123 |
| Сотрудник | employee2@meetspace.ru | Employee123 |
| Гость | guest@meetspace.ru | Guest12345 |

## Стек

| Слой | Технологии |
|---|---|
| Frontend | React 19, TypeScript (strict), React Router, TanStack Query, MUI, React Hook Form + Zod, Recharts, Vite |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic, JWT (access + refresh), bcrypt |
| БД | PostgreSQL 16 (10 таблиц, 3НФ, миграции) |
| Документация API | OpenAPI 3 (Swagger UI) |
| Инфраструктура | Docker, Docker Compose, Nginx, GitHub Actions |
| Тесты | pytest + coverage, Vitest + Testing Library, Playwright (e2e) |

Стек зафиксирован и не меняется.

## Быстрый запуск (Docker)

Нужен только [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/andreipauli2006-png/mr meetspace
cd meetspace
docker compose up --build
```

- Приложение: http://localhost:8080
- Swagger: http://localhost:8080/api/docs

При старте автоматически применяются миграции и заливаются тестовые данные.

## Запуск для разработки (без Docker)

Нужны Python 3.12+, Node.js 22+, PostgreSQL 16.

```bash
# база
createdb booking

# бэкенд
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env            # в DATABASE_URL поставьте localhost вместо db
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload    # http://localhost:8000/api/docs

# фронтенд (в другом терминале)
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

## Тесты

```bash
# бэкенд: unit + интеграционные (нужна тестовая БД booking_test)
cd backend
createdb booking_test
pytest --cov=app/services        # покрытие сервисного слоя ~92%

# фронтенд: unit + компоненты
cd frontend
npm test

# e2e (приложение должно быть запущено)
npx playwright install chromium
npm run e2e
```

Подробно — в [docs/testing-report.md](docs/testing-report.md).

## Структура проекта

```
meetspace/
├── backend/
│   ├── app/
│   │   ├── core/          # настройки, безопасность (JWT, bcrypt), RBAC, формат ошибок
│   │   ├── models/        # ORM-модели (таблицы БД)
│   │   ├── schemas/       # Pydantic-схемы запросов/ответов
│   │   ├── repositories/  # запросы к БД
│   │   ├── services/      # бизнес-логика (бронирование, авторизация, отчёты)
│   │   ├── routers/       # контроллеры (эндпоинты API)
│   │   ├── main.py        # точка входа
│   │   └── seed.py        # тестовые данные
│   ├── alembic/           # миграции БД
│   └── tests/             # pytest
├── frontend/
│   ├── src/
│   │   ├── api/           # axios-клиент, типы, запросы
│   │   ├── auth/          # контекст авторизации, защищённые маршруты
│   │   ├── components/    # UI-kit: таблицы, диалоги, состояния загрузки/ошибок
│   │   ├── pages/         # страницы
│   │   └── utils/         # форматирование, расчёт слотов, валидация
│   └── e2e/               # Playwright
├── docs/                  # user stories, ER-диаграмма, архитектура, OpenAPI, отчёт о тестировании
├── docker-compose.yml     # локальный запуск
├── Dockerfile             # образ «всё в одном» для хостинга
├── render.yaml            # деплой на Render
└── .github/workflows/     # CI
```

## Функционал

**Обязательный (MVP):**
- регистрация, вход по email и паролю, JWT access + refresh с ротацией, выход, восстановление пароля (ссылка выводится в лог сервера);
- 3 роли с проверкой прав на сервере;
- CRUD залов (создание, просмотр, редактирование, удаление с подтверждением), локации, удобства;
- списки с пагинацией, поиском, сортировкой и фильтрами на сервере (залы, брони, пользователи, журнал);
- валидация на клиенте (Zod) и сервере (Pydantic) с понятными сообщениями;
- загрузка фото залов (JPG/PNG/WEBP, до 5 МБ, проверка содержимого файла);
- личный кабинет: профиль, смена пароля, история действий, мои брони;
- панель администратора: пользователи, роли, блокировка;
- дашборд с графиками;
- адаптивная вёрстка 360–1920 px.

**Дополнительный:**
- экспорт броней в Excel (XLSX);
- журнал аудита действий пользователей;
- тёмная тема.

## Безопасность

- пароли хранятся только в виде хэша bcrypt;
- SQL-инъекции исключены: все запросы через ORM с параметрами;
- XSS: React экранирует вывод, загружаемые файлы проверяются по сигнатуре и сохраняются под случайным именем;
- CORS разрешён только для адреса фронтенда;
- проверка доступа к каждому ресурсу: чужую бронь нельзя открыть или изменить, подставив ID (ответ 404);
- refresh-токены хранятся в БД в виде хэша, одноразовые, отзываются при выходе и смене пароля;
- секреты — только в переменных окружения (`.env` в `.gitignore`, пример — `.env.example`).

## Деплой (бесплатно, Render.com)

1. Зарегистрироваться на https://render.com через GitHub.
2. **New → Blueprint** → выбрать репозиторий. Render прочитает `render.yaml` и создаст базу и сервис.
3. После сборки поменять `CORS_ORIGINS` и `FRONTEND_URL` на выданный адрес, если он отличается.

Бесплатный сервис «засыпает» без запросов — первый заход после паузы открывается ~1 минуту.
Перед защитой откройте сайт заранее.

## Процесс разработки

- ветка `main` защищена, работа в `feature/*` ветках, слияние через Pull Request с самопроверкой по чек-листу;
- сообщения коммитов — [Conventional Commits](https://www.conventionalcommits.org/ru/) (`feat:`, `fix:`, `docs:`, `test:`…);
- CI на каждый PR: линтер → тесты → сборка Docker-образов.
