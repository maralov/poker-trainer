# Деплой

Все, що можна було зробити з коду, зроблено: міграції, RLS, CI, конфіг Vercel.
Лишились кроки, які вимагають ваших акаунтів — їх треба виконати вручну.
Порядок важливий: Google → Supabase → Vercel → повернутись у Google і Supabase
дописати фінальну адресу.

## 1. Проект Supabase

1. [database.new](https://database.new) → створити проект. Регіон — найближчий
   до вас (Європа).
2. Зберегти пароль бази: він знадобиться для `db push`.
3. Project Settings → API → записати **Project URL** і **anon public** ключ.

> **`service_role` ключ нікуди не вписувати.** Він обходить RLS. У цьому
> застосунку він не потрібен взагалі.

## 2. Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → новий проект.
2. **APIs & Services → OAuth consent screen**: тип External, заповнити назву,
   пошту підтримки й контакт розробника. Поки застосунок у режимі Testing,
   увійти зможуть лише акаунти зі списку Test users — додайте себе.
3. **Credentials → Create credentials → OAuth client ID**, тип Web application.
   - Authorized JavaScript origins: `https://<project-ref>.supabase.co`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Записати Client ID і Client Secret.
5. У Supabase: **Authentication → Providers → Google** → увімкнути, вставити
   Client ID і Secret → Save.

## 3. Схема бази

З кореня репо:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Перевірка — у Supabase SQL Editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- attempts | true          ← якщо false, зупиніться і розберіться

select polname, cmd from pg_policies where tablename = 'attempts';
-- має бути рівно дві: SELECT і INSERT. UPDATE/DELETE не має бути.
```

## 4. Vercel

1. [vercel.com/new](https://vercel.com/new) → імпортувати репозиторій.
   `vercel.json` у корені вже задає команди збірки — нічого не міняти.
2. **Environment Variables** (усі три оточення):
   - `VITE_SUPABASE_URL` = Project URL з кроку 1
   - `VITE_SUPABASE_ANON_KEY` = anon public ключ з кроку 1
3. Deploy. Записати видану адресу.

## 5. Замкнути коло

Тепер, коли адреса відома:

1. **Supabase → Authentication → URL Configuration**:
   - Site URL: `https://<ваш-домен>`
   - Redirect URLs: додати `https://<ваш-домен>` і `https://*-<ваш-акаунт>.vercel.app`
     (щоб працювали прев'ю-деплої)
2. **Google Cloud → Credentials → ваш OAuth client**:
   - Authorized JavaScript origins: додати `https://<ваш-домен>`

Без цього кроку вхід завершиться помилкою redirect_uri_mismatch.

## 6. Smoke-чеклист

Пройти повністю, по порядку:

- [ ] Відкрити сайт — тренажер працює **без входу**, руки роздаються
- [ ] Зіграти 10 рук, у панелі акаунта видно «10 у черзі»
- [ ] Увійти через Google → черга спорожніла, статус «усе синхронізовано»
- [ ] Вкладка «Статистика» → внизу «Дані з сервера — зведені з усіх пристроїв»
- [ ] Відкрити з телефона, увійти тим самим акаунтом → **ті самі цифри**
- [ ] Вимкнути мережу, зіграти 5 рук → тренажер працює, лічильник черги росте
- [ ] Увімкнути мережу → черга доїжджає, дублів немає (перевірити `select count(*)`)
- [ ] Вийти й зайти знову → статистика на місці

## Що варто знати про безкоштовний тариф

- Проект Supabase **засинає після тижня без запитів**. Перший запит після
  паузи буде повільним; регулярне користування цього не допускає.
- Ліміт бази — 500 МБ. Один рядок `attempts` — близько 100 байт, тобто
  запасу вистачить на мільйони спроб.
- Anon-ключ у бандлі — так і має бути. Ізоляція тримається на RLS, і саме тому
  політики покриті тестами.

## Якщо щось пішло не так

| Симптом | Причина |
|---|---|
| `redirect_uri_mismatch` | Крок 5 не виконано або домен вписано з помилкою |
| Вхід проходить, але статистика порожня | Не виконано `db push`, або RLS вимкнено |
| `permission denied for table attempts` | Немає `grant ... to authenticated` — перевірте, що міграція застосувалась повністю |
| Вхід працює локально, але не в проді | У Vercel не задані `VITE_*` змінні; перевірте, що деплой після їх додавання перезібрано |
