#!/usr/bin/env bash
# Executado na VPS pelo GitHub Actions a cada merge na main (veja .github/workflows/ci.yml).
# Baixa as imagens do commit (IMAGE_TAG no infra/.env), aplica as migrações e reinicia o que mudou.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "infra/.env não encontrado (o workflow cria antes de chamar este script)."; exit 1; }
compose() { docker compose --profile prod "$@"; }

echo "==> Baixando imagens ($(grep '^IMAGE_TAG=' .env | cut -d= -f2 | cut -c1-12))"
compose pull --quiet

echo "==> Subindo (o serviço migrate aplica só as migrações novas antes do web e da api)"
if ! compose up -d --no-build --remove-orphans; then
  echo "!! Falhou. Últimos logs:"
  compose logs --no-log-prefix --tail 60 migrate web api || true
  exit 1
fi

# A API do banco (PostgREST) guarda a lista de tabelas e funções; recarrega depois das migrações
# para que funções com assinatura nova (ex.: parâmetro novo) não fiquem "não encontradas".
echo "==> Recarregando o cache do PostgREST"
compose kill -s SIGUSR1 rest >/dev/null 2>&1 || echo "(não foi possível recarregar o rest; segue)"

echo "==> Limpando imagens antigas"
docker image prune -f >/dev/null
compose ps --format 'table {{.Service}}\t{{.Status}}'
