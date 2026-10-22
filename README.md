# Business Card Website Template

I create this website to function like a business card would. It's meant to be used as a static website where you can display basic information like your name, company, logo, and contact links. Card size and shape changed depending on what size screen the website is being visited from. This is a very small and easy to edit website so feel free to use this code for yourself.

You can checkout the code in action [here](https://avigael.github.io/business-card-site/ "demo").

<img src="./screenshot.png" alt="Screenshot" />

## License
This website is licensed under the [MIT License](https://github.com/avigael/github-pages/blob/master/LICENSE).

## Reiseplaner (`/reise`)

Admin på `/reise`, gjestevisning på `/reise/<kode>`. Data ligger i Supabase.

1. Opprett et Supabase-prosjekt og kjør `supabase/schema.sql` i SQL Editor.
   Legg til flere admin-e-poster med `insert into admins values ('...')`.
2. Authentication → Users → *Add user* med en e-post fra `admins`, og skru av
   *Allow new users to sign up* under Authentication → Sign In / Providers.
3. Kopier `.env.example` til `.env` og fyll inn URL og anon/publishable key (Project Settings → API).
4. På GitHub: Settings → Secrets and variables → Actions → **Variables**: legg inn
   `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY`. Disse brukes av deploy og av
   den ukentlige keepalive-jobben (`.github/workflows/supabase-keepalive.yml`).
