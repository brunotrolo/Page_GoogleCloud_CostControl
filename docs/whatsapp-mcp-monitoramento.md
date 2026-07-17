# WhatsApp MCP — monitoramento e runbook

O canal de alerta não pode **falhar em silêncio** (a pior falha é ele estar morto justo quando
você precisa). Há duas camadas de vigilância, ambas checando o mesmo endpoint público:

`GET https://34.139.120.158.sslip.io/health` → `{ "status":"ok", "whatsapp":"conectado", "online":true, "conectado_desde":..., "uptime_processo_s":..., "ultima_entrega_confirmada":... }`

O sinal que importa é **`"online": true`** — cobre os dois modos de falha: VM fora do ar (não responde)
e sessão deslogada (VM no ar, mas WhatsApp caído → `online:false`).

---

## Camada 1 — Verificação diária (GitHub Actions) ✅ implantada

Workflow [`.github/workflows/whatsapp-health.yml`](../.github/workflows/whatsapp-health.yml):
roda **todo dia às 12:00 UTC** (e sob demanda em *Actions → Run workflow*), faz GET no `/health` e
**FALHA** se `online` não for `true`. Quando um workflow agendado falha, o **GitHub envia e-mail** ao
dono do repositório.

**Para receber os e-mails** (uma vez): GitHub → *Settings → Notifications → Actions* → marque
**Email**, e confirme que o e-mail da conta é o desejado (o mesmo da conta Google Cloud).

**Mudar a frequência:** edite o `cron` no workflow. Ex.: `0 */6 * * *` = a cada 6h (detecção mais
rápida). Diário (`0 12 * * *`) é o padrão atual. ⚠️ Quanto maior o intervalo, maior a "janela cega"
se a sessão cair logo após uma checagem.

---

## Camada 2 — UptimeRobot (externo, opcional, detecção rápida)

Serviço externo grátis que checa a cada 5 min e alerta **só quando muda de estado** (caiu/voltou) —
não gera spam. Complementa a Camada 1 com detecção mais rápida e independente do GitHub.

**Passo a passo:**
1. Crie conta grátis em **https://uptimerobot.com** (o e-mail do cadastro recebe os alertas — use o
   seu, o mesmo da conta Google Cloud).
2. **+ Add New Monitor**.
3. **Monitor Type:** `Keyword` (não use "HTTP(s)" simples — o keyword pega a sessão deslogada).
4. **URL (or IP):** `https://34.139.120.158.sslip.io/health`
5. **Keyword Type:** `exists` · **Keyword:** `"online":true`
   (assim ele considera "no ar" só quando o corpo contém `"online":true`; VM no ar mas deslogada = alerta).
6. **Monitoring Interval:** 5 minutes (mínimo do plano free).
7. **Alert Contacts To Notify:** marque o seu e-mail.
8. **Create Monitor.** Pronto — se cair ou deslogar, chega um e-mail; quando voltar, outro.

> Nota: o plano free do UptimeRobot não oferece intervalo de 24h (mínimo 5 min). Mas como ele só
> notifica na **mudança de estado**, isso não vira spam — você só ouve dele quando algo quebra.

---

## Runbook — "o canal parou, e agora?"

1. **Cheque o health** (de qualquer lugar):
   ```bash
   curl -s https://34.139.120.158.sslip.io/health; echo
   ```
   - Não responde → VM fora do ar (passo 2).
   - `"online":false` / `deslogado_precisa_novo_qr` → sessão caiu (passo 3).

2. **VM fora do ar / serviço parado:**
   ```bash
   gcloud compute ssh whatsapp-mcp-vm --project=whatsapp-mcp-server-502704 --zone=us-east1-b \
     --command="sudo systemctl status whatsapp-mcp --no-pager | head; sudo systemctl restart whatsapp-mcp"
   ```
   Se a VM em si estiver parada: `gcloud compute instances start whatsapp-mcp-vm --zone=us-east1-b`.

3. **Sessão deslogada (precisa re-parear):**
   ```bash
   gcloud compute ssh whatsapp-mcp-vm --project=whatsapp-mcp-server-502704 --zone=us-east1-b
   sudo systemctl stop whatsapp-mcp
   sudo rm -rf /opt/whatsapp-mcp/auth_info_baileys
   sudo systemctl start whatsapp-mcp
   sudo journalctl -u whatsapp-mcp -f   # escaneie o novo QR com o número REMETENTE
   ```

4. **Diagnóstico de bugs conhecidos** (405, 9º dígito, etc.): ver
   [`../patches/whatsapp_mcp/docs/TROUBLESHOOTING.md`](../patches/whatsapp_mcp/docs/TROUBLESHOOTING.md).
