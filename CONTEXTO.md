# CONTEXTO DO PROJETO — ORMED (backend NestJS)

> **Para o assistente (Claude):** lê isto primeiro. Este é o **backend** (NestJS 10 + Mongoose,
> deploy no Render). O **documento de contexto completo** (arquitetura, estado, papéis, fluxos e
> pendências dos DOIS repositórios) está no repo **frontend**: `ordem-dos-medicos-angola/CONTEXTO.md`.
> Lê esse para o panorama geral.

## Resumo rápido deste repo

- **Stack:** NestJS 10, Mongoose 8 (MongoDB), bcrypt, class-validator, JWT, Cloudinary, Helmet, Throttler.
- **Padrão:** cada módulo é **um único ficheiro** com schema + DTOs + service + controller + module
  em `src/modules/<nome>/<nome>.module.ts`. Manter este estilo.
- **Deploy:** Render, auto no `git push origin main` (~50s spin-up). Node ≥ 20.
- **Git remoto:** `https://github.com/Inheal-ao/ormed-backend.git`.
- **Frontend:** `https://github.com/Inheal-ao/ormed.git` (Next.js, Vercel).

## Regras invioláveis

- **Nunca commitar segredos** (Mongo, JWT, Cloudinary, SMTP…). Só em variáveis de ambiente do Render.
- Papéis: `super_admin`/`bastonaria` passam todos os `@Roles`; `funcionario` passa onde há `EDITOR`
  (+ restrição por `permissions` no PermissionsGuard); ação exclusiva da Bastonária = `@Roles(BASTONARIA)`.

## Pendência principal

- **Sem infra de email.** As credenciais do médico (ao concluir a inscrição) são geradas e
  entregues manualmente pela equipa. Falta um módulo de email (SMTP/Brevo/Resend) com `SMTP_*`/
  `MAIL_*` em env vars do Render para envio automático. Ver detalhe no `CONTEXTO.md` do frontend.
