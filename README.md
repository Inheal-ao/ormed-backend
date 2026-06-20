# ORMED Backend

API da plataforma da **Ordem dos Médicos de Angola**, construída em [NestJS](https://nestjs.com/) + MongoDB.

## Stack

- **NestJS 10** (TypeScript)
- **MongoDB** via Mongoose
- **JWT** (access + refresh com rotação) para autenticação dos admins
- **Cloudinary** para uploads de imagens e PDFs
- Segurança: Helmet, CORS restrito, rate limiting (Throttler), validação de DTOs, bcrypt

## Arranque local

```bash
npm install
cp .env.example .env   # preencher os valores
npm run seed:admin     # cria o primeiro super admin
npm run start:dev      # http://localhost:4000/api
```

Verificação rápida: `GET http://localhost:4000/api/health`

## Variáveis de ambiente

Ver [.env.example](.env.example). Críticas: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.

## Autenticação

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| POST | `/api/auth/login` | público | Login (5 tentativas/min) |
| POST | `/api/auth/refresh` | refresh token | Renova os tokens |
| POST | `/api/auth/logout` | autenticado | Invalida a sessão |
| GET | `/api/auth/me` | autenticado | Dados do utilizador atual |

Todas as outras rotas são protegidas por JWT por defeito (exceto as marcadas `@Public()`).

## Papéis

- `super_admin` — controlo total, incluindo gestão de admins
- `admin` — gestão de todo o conteúdo
- `editor` — criação/edição de conteúdo
