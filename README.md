# Мяу-мяу-мяу

Статический сайт (GitHub Pages) + Supabase (база и функция бота) + Telegram-бот.

## Настройка

1. **Бот.** В Telegram → @BotFather → `/newbot` → получи токен. Свои tg id (и Викин) узнай у @userinfobot.
2. **Supabase.** Создай бесплатный проект на supabase.com. SQL Editor → вставь `supabase/schema.sql` → Run.
   Затем выполни (с настоящими id):
   ```sql
   insert into users(name, tg_id) values ('Вика', 111111111), ('Витя', 222222222);
   ```
3. **Функция бота** (нужен [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase secrets set BOT_TOKEN=<токен> WEBHOOK_SECRET=<любая-длинная-строка> SITE_URL=https://<ник>.github.io/<репо>/
   supabase functions deploy bot --no-verify-jwt
   ```
4. **Вебхук Telegram** (один раз):
   ```bash
   curl "https://api.telegram.org/bot<токен>/setWebhook?url=https://<ref>.supabase.co/functions/v1/bot&secret_token=<WEBHOOK_SECRET>"
   ```
5. **Сайт.** Впиши `SUPABASE_URL` и `ANON_KEY` в `config.js`, залей папку в GitHub-репозиторий, Settings → Pages → Deploy from branch.
6. Напиши боту `/start` — получишь номерок. Вика делает то же самое.

## Как это защищено
Таблицы закрыты полностью, доступ только через функции, которые на каждый запрос проверяют номерок.
Бот выдаёт номерок только двум заранее внесённым tg id.
