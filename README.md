# TriGGer.Arena — Web Platform

Comunidad argentina de Counter-Strike 1.6.

## Stack

- **Framework**: [Astro](https://astro.build) (SSR, output: server)
- **Backend/Auth**: [Supabase](https://supabase.com)
- **Deploy**: [Vercel](https://vercel.com)
- **Icons**: [Tabler Icons](https://tabler-icons.io)

## Estructura del proyecto

```
src/
├── components/          # Componentes Astro (secciones del sitio público)
├── layouts/
│   └── Layout.astro     # Layout base (SEO, loader, toast, section dots)
├── lib/
│   ├── api.ts           # Helpers de API: jsonResponse, requireAuth, requireAdmin
│   ├── site-data.ts     # Datos desde Supabase (settings, servers, content blocks)
│   ├── server-status.ts # Consulta de estado de servidores via gamedig
│   ├── supabase.ts      # Clientes de Supabase (browser, admin, SSR)
│   └── types.ts         # Tipos TypeScript compartidos
├── middleware.ts         # Auth, mantenimiento, headers de seguridad
├── pages/
│   ├── index.astro      # Home pública
│   ├── admin/           # Panel de administración
│   ├── usuario/         # Portal del usuario
│   ├── auth/            # Login, reset, callback
│   └── api/             # Endpoints REST
├── styles/
│   └── global.css       # Variables CSS y estilos base
└── env.d.ts             # Types de variables de entorno y App.Locals
```

## Variables de entorno

Copiar `.env.example` a `.env` y completar.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
