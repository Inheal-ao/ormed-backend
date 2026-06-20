# Deploy do Backend ORMED (Render)

O backend é uma API Node/NestJS. O Render tem um plano gratuito adequado.

## 1. Criar o serviço

1. Conta em [render.com](https://render.com) (login com GitHub).
2. **New → Web Service** → liga o repositório `Inheal-ao/ormed-backend`.
3. O Render deteta o [render.yaml](render.yaml). Confirma:
   - Build: `npm install && npm run build`
   - Start: `npm run start:prod`
   - Health check: `/api/health`

## 2. Variáveis de ambiente (no painel do Render)

Preencher (valores reais estão no teu `.env` local / ficheiros de credenciais):

| Variável | Valor |
|----------|-------|
| `MONGODB_URI` | string de ligação do MongoDB Atlas (com `/ormed`) |
| `JWT_SECRET` | segredo aleatório forte |
| `JWT_REFRESH_SECRET` | outro segredo aleatório forte |
| `CORS_ORIGINS` | `https://ormed-qx3s.vercel.app` (URL do site no Vercel) |
| `CLOUDINARY_CLOUD_NAME` | `dzwd1wrv9` |
| `CLOUDINARY_API_KEY` | a tua API key |
| `CLOUDINARY_API_SECRET` | o teu API secret |
| `SEED_ADMIN_EMAIL` | email do 1º admin |
| `SEED_ADMIN_PASSWORD` | password do 1º admin |

> No MongoDB Atlas → **Network Access**, garante que `0.0.0.0/0` (ou os IPs do Render) está permitido.

## 3. Criar o primeiro admin

Após o primeiro deploy, abre o **Shell** do serviço no Render e corre:

```bash
npm run seed:admin
```

## 4. Ligar o frontend (Vercel)

No projeto do Vercel (`ormed`), adiciona a variável de ambiente:

```
NEXT_PUBLIC_API_URL = https://<o-teu-servico>.onrender.com/api
```

Depois faz **Redeploy** do frontend. O painel `/admin` passa a falar com o backend em produção.

> Nota: no plano gratuito do Render o serviço "adormece" após inatividade; o primeiro pedido depois disso demora ~30s a acordar.
