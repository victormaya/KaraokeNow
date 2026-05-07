#!/bin/bash
set -e

echo "=== Instalando Docker ==="
apt-get update -qq
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== Clonando repositório ==="
git clone https://github.com/victormaya/KaraokeNow.git /app/karaoke

echo ""
echo "✓ Setup concluído! Próximos passos:"
echo ""
echo "  cd /app/karaoke"
echo "  cp .env.example .env"
echo "  nano .env          # adicione REPLICATE_API_TOKEN e CORS_ORIGINS"
echo "  # copie seu cookies.txt para /app/karaoke/cookies.txt"
echo "  docker compose up -d --build"
echo ""
echo "  O app vai estar em: http://SEU_IP:3000"
