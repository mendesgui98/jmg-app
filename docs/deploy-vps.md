# Deploy na VPS (Hostinger KVM 2)

Endereços:

- **Sistema:** `https://app.jmgreformas.com.br`
- **API:** `https://api.jmgreformas.com.br` (login, banco e arquivos; `/jmg/*` é a API própria)
- `jmgreformas.com.br` e `www` continuam livres para o site institucional.

Como funciona: PR para a `main` → CI testa e constrói as imagens. **Merge na `main`** → CI testa,
publica as imagens no GitHub Container Registry (GHCR) e a VPS baixa e reinicia sozinha
(`.github/workflows/ci.yml`, job "Deploy na VPS"). A VPS não compila nada.

## 1. Sistema operacional (hPanel)

hPanel → **VPS** → **Sistema operacional** → **SO simples** (sem painel) → **Ubuntu 24.04 LTS**.
Defina uma senha root forte. Anote o IP da VPS. Uma KVM 2 (2 vCPU, 8 GB) sobra para esta stack.

## 2. DNS (dois registros A)

Onde o DNS de `jmgreformas.com.br` é gerenciado (hPanel → Domínios → DNS, se o domínio está na
Hostinger), crie:

| Tipo | Nome  | Aponta para | TTL  |
| ---- | ----- | ----------- | ---- |
| A    | `app` | IP da VPS   | 3600 |
| A    | `api` | IP da VPS   | 3600 |

Não mexa no `@`, `www` nem nos registros de e-mail (MX/TXT). Confira: `ping app.jmgreformas.com.br`.

## 3. Chave de deploy (no seu computador)

```sh
ssh-keygen -t ed25519 -f ~/.ssh/jmg-deploy -N "" -C "github-actions-jmg"
```

- `~/.ssh/jmg-deploy.pub` (pública) vai para a VPS no próximo passo.
- `~/.ssh/jmg-deploy` (privada) vai para o segredo `VPS_SSH_KEY` no GitHub.

## 4. Preparar a VPS (uma vez)

Na pasta do projeto, no seu computador (pede a senha root):

```sh
ssh root@IP_DA_VPS "bash -s -- '$(cat ~/.ssh/jmg-deploy.pub)'" < infra/vps/setup.sh
```

Instala Docker, cria o usuário `deploy`, liga firewall (22/80/443), fail2ban, atualizações de
segurança automáticas, 2 GB de swap e o backup diário. Teste: `ssh -i ~/.ssh/jmg-deploy deploy@IP_DA_VPS`.

## 5. Segredos do sistema (no seu computador)

```sh
node scripts/generate-keys.mjs
```

Gera `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` e `POSTGRES_PASSWORD`. Guarde num gerenciador de
senhas. **Não troque `POSTGRES_PASSWORD` depois do primeiro deploy** (o banco é criado com ela).

## 6. Configurar o GitHub

Repositório → **Settings → Secrets and variables → Actions**.

**Secrets** (aba Secrets):

| Nome                | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| `VPS_SSH_KEY`       | conteúdo inteiro de `~/.ssh/jmg-deploy` (chave privada)  |
| `POSTGRES_PASSWORD` | do passo 5                                               |
| `JWT_SECRET`        | do passo 5                                               |
| `ANON_KEY`          | do passo 5                                               |
| `SERVICE_ROLE_KEY`  | do passo 5                                               |
| `SMTP_PASS`         | senha da caixa de e-mail que envia convites (ver abaixo) |

**Variables** (aba Variables):

| Nome               | Valor                                             |
| ------------------ | ------------------------------------------------- |
| `VPS_HOST`         | IP da VPS                                         |
| `APP_DOMAIN`       | `app.jmgreformas.com.br`                          |
| `API_DOMAIN`       | `api.jmgreformas.com.br`                          |
| `ACME_EMAIL`       | seu e-mail (avisos do certificado HTTPS)          |
| `SMTP_HOST`        | ex.: `smtp.hostinger.com`                         |
| `SMTP_PORT`        | `465` (SSL) ou `587`                              |
| `SMTP_USER`        | ex.: `nao-responda@jmgreformas.com.br`            |
| `SMTP_ADMIN_EMAIL` | remetente; vazio = `SMTP_USER`                    |
| `VPS_USER`         | opcional, padrão `deploy`                         |
| `VPS_PORT`         | opcional, padrão `22`                             |
| `SIGNUP_ENABLED`   | opcional, padrão `false` (entrada só por convite) |
| `VPS_KNOWN_HOSTS`  | recomendado: chave SSH da VPS fixada (ver abaixo) |

`VPS_KNOWN_HOSTS`: na VPS, rode `ssh-keyscan -p 22 localhost | sed "s/^localhost/IP_DA_VPS/"`
(troque `IP_DA_VPS` pelo valor de `VPS_HOST`; se a porta não for 22, use `[IP]:porta`) e cole a
saída na variável. Com ela o deploy só aceita a chave verdadeira do servidor; sem ela o deploy
confia na primeira chave que receber (e mostra um aviso).

E-mail: crie uma caixa como `nao-responda@jmgreformas.com.br` (hPanel → E-mails) e use os dados
SMTP dela. Sem SMTP o sistema funciona, mas convites e "esqueci a senha" não enviam e-mail.

## 7. Primeiro deploy

Faça o merge do PR na `main` (ou Actions → **CI/CD** → **Run workflow** na `main`). Acompanhe em
**Actions**. O primeiro deploy demora mais (baixa todas as imagens); o HTTPS sai sozinho assim
que o DNS do passo 2 estiver valendo.

## 8. Primeiro administrador (uma vez)

```sh
ssh -i ~/.ssh/jmg-deploy deploy@IP_DA_VPS
bash /opt/jmg/infra/vps/create-admin.sh guilhermeandriolamendes@gmail.com
```

Entre em `https://app.jmgreformas.com.br`. Os demais usuários entram por convite
(Configurações → Usuários).

## Dia a dia

- **Atualizar o sistema:** abrir PR → CI verde → merge. Só isso.
- **Voltar uma versão:** Actions → execução antiga da `main` → **Re-run all jobs** (republica e
  reinstala aquele commit). Migrações de banco não são desfeitas.
- **Logs:** `ssh deploy@IP` → `cd /opt/jmg/infra && docker compose logs -f --tail 100 web api`
- **Estado:** `cd /opt/jmg/infra && docker compose ps`
- **Backup:** automático às 03:30 em `/opt/jmg/backups` (14 dias). Copie para fora da VPS de vez em
  quando, por exemplo do seu computador:
  `scp -i ~/.ssh/jmg-deploy -r deploy@IP_DA_VPS:/opt/jmg/backups ./backups-jmg`
  e ative também o backup semanal da própria Hostinger (hPanel → VPS → Backups).
- **Painel do banco (Studio):** `ssh -i ~/.ssh/jmg-deploy -L 3001:127.0.0.1:3001 deploy@IP_DA_VPS`
  e abra `http://localhost:3001`.

## Levar os dados locais para a produção

Copia tudo da stack local (`bun run stack:up`) para a VPS: dados, usuários (com as mesmas senhas,
papéis e 2FA) e arquivos. **Substitui** o que houver em produção; um backup é feito antes.

1. No seu computador, com a `main` atualizada e a stack local no ar (aplica as migrações novas):

   ```sh
   git checkout main && git pull
   bun run stack:up
   bash scripts/export-data.sh
   ```

2. Enviar para a VPS:

   ```sh
   ssh root@IP_DA_VPS mkdir -p /opt/jmg/import
   scp jmg-export/* root@IP_DA_VPS:/opt/jmg/import/
   ```

3. Na VPS, como root (pede para digitar `SUBSTITUIR`):

   ```sh
   bash /opt/jmg/infra/vps/import-data.sh
   ```

4. Entre com o e-mail e a senha do sistema local. Depois apague as cópias:
   `rm -rf /opt/jmg/import` na VPS e `jmg-export/` no computador (têm dados e senhas criptografadas).

O script recusa a importação se o banco local e o de produção estiverem em versões diferentes de
migração. Se der errado, o backup feito antes fica em `/opt/jmg/backups`.

## Segurança extra (recomendado, depois que o acesso por chave funcionar)

Desligue login por senha no SSH: na VPS, como root, em `/etc/ssh/sshd_config` deixe
`PasswordAuthentication no` e rode `systemctl restart ssh`. Antes, confirme que entra com chave.

## Site institucional na mesma VPS?

O Caddy desta stack ocupa as portas 80/443. Se o site institucional também for ficar nesta VPS,
ele precisa entrar no `infra/caddy/Caddyfile` (um bloco `jmgreformas.com.br, www.jmgreformas.com.br`).
Se ficar na hospedagem de sites da Hostinger, nada muda aqui.
