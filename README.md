# Aladdin Tech — Loja virtual

Loja completa com central do lojista. Node.js 22.13+ e banco SQLite embutido (`data/loja.db`).

## Como rodar
```
npm install
npm start
```
- Loja: http://localhost:3000
- Central do lojista: http://localhost:3000/admin
  - Primeiro acesso: usuário **admin**, senha **aladdin2026** — o sistema obriga a criar uma senha nova.

## Central do lojista
- **Anunciar produto**: fotos (arrastar, reordenar, estúdio para remover fundo e enquadrar), título, categoria, condição, descrição com modelos prontos, variações, ficha técnica, preço “de”, custo (privado, mostra margem), promoção com início/fim, estoque, SKU, garantia. Prévia ao vivo e nota de qualidade do anúncio.
- **Promoções**: aplicar % em produtos selecionados, numa categoria ou na loja toda, com prazo. A loja mostra selo “Oferta”, contagem regressiva e a página /ofertas.
- **Cupons**: percentual, valor fixo ou frete grátis, com pedido mínimo, limite de usos e validade.
- **Avaliações**: clientes enviam nota, texto e até 5 fotos; selo “Compra verificada” com o código do pedido; moderação, resposta pública e remoção de fotos.
- **Perguntas**: clientes perguntam na página do produto; a equipe responde no painel.
- **Fotos da loja**: foto da equipe com nomes e “Mural dos Upgrades” (clientes com a árvore).
- **Equipe**: acessos individuais com perfis Dono, Gerente e Vendedor.
- **Segurança**: troca de senha, encerrar sessões, registro de atividades.

## Segurança
Senhas com scrypt, bloqueio após tentativas erradas, sessão em cookie HttpOnly/SameSite com expiração, proteção CSRF por origem,
cabeçalhos CSP/anti-clickjacking, validação de imagens pelo conteúdo, limites de envio por IP, preços sempre recalculados no servidor
e moderação de conteúdo dos clientes. Em produção, use **HTTPS** (o cookie passa a ser `Secure` automaticamente).

## Backup
Copie `data/` (banco) e `public/uploads/` (fotos).

## Integrações (Configurações → somente Dono)
- **Frete em tempo real — Melhor Envio:** PAC, SEDEX e transportadoras calculados pelo CEP, com peso e medidas do produto. A entrega grátis da região continua valendo. Sem token, o site usa a tabela fixa.
- **Nota fiscal — Focus NFe:** NF-e emitida automaticamente quando o pagamento é confirmado (ou pelo botão no pedido), com envio por e-mail ao cliente e cancelamento pelo painel. CFOP, CSOSN/CST e NCM devem ser validados pelo contador. Com a nota ativa, o CPF é obrigatório no checkout.
- **Carrinho abandonado:** 1º lembrete após 1 h e 2º após 24 h (configurável, com cupom opcional), para clientes com conta e visitantes que autorizaram. Painel “Carrinhos abandonados” com botão de WhatsApp.
- Variáveis de ambiente opcionais: `ME_TOKEN`, `FOCUS_TOKEN` (em vez de salvar no painel), `PUBLIC_URL` (endereço do site nos e-mails automáticos).

## Recursos de vendas e gestão (novembro/2026)

| Recurso | Onde fica | Observações |
|---|---|---|
| Ranking da equipe | Painel → Ranking da equipe · pódio na página inicial | Conta vendas pagas. Link de vendas `/?v=usuario`, WhatsApp do consultor, "Quem te atendeu?" no checkout e venda no balcão. |
| Comissões | Painel → Comissões (**só o perfil Dono**) | Percentual padrão, por categoria e por consultor. Base = valor pago sem frete. "Marcar como pago" trava o valor. Exporta CSV. |
| Esqueci minha senha (equipe) | Tela de login do painel | Link por e-mail (30 min). Sem e-mail: o Dono é avisado. Emergência: `node tools/redefinir-senha-painel.js <usuario>`. |
| Garantia por IMEI | Pedido / venda no balcão · consulta pública em `/garantia` | Recibo + termo em `/documento/<token>` (imprimir/salvar PDF, enviar no WhatsApp). Prazos em Configurações. |
| Seminovos | Cadastro do produto (condição Seminovo/Vitrine) | Estado A/B/C, saúde da bateria, IMEI verificado, fotos reais, acompanha, observações. |
| Comparador de iPhones | `/comparar` | iPhone 11 ao 17 Pro Max (dados oficiais Apple, `public/js/iphones.js`), preço e link da loja quando há estoque. |
| Reservar e retirar | Botão na página do produto | Sem pagamento; prazo em Configurações (padrão 24h). Expirou → cancela e devolve o estoque (job a cada 5 min). |
| Indique e ganhe | Minha conta → Indique e ganhe | Amigo cria conta pelo link `/?indica=CODIGO` e ganha % na 1ª compra; quem indicou ganha cupom em R$ quando a compra é paga. Cupons pessoais. |
| Avisos pelo WhatsApp | Configurações (Dono) · botão no pedido | Z-API ou API oficial da Meta (modelo aprovado com `{{1}}`). Sem integração: mensagem pronta via wa.me. Variáveis de teste: `ZAPI_URL`, `WA_META_URL`. |
| SEO e prévias | Automático | Título/descrição/imagem por página (WhatsApp, Instagram, Google), dados de produto e da loja (schema.org), `/sitemap.xml`, `/robots.txt`. Publicado, defina `PUBLIC_URL`. |
| Google Analytics / Pixel | Configurações → Medição de resultados | Só carregam depois de "Aceitar todos" no aviso de cookies. Eventos: página, produto, sacola, checkout, compra, contato. |
| Fotos em WebP | Automático ao abrir o painel (Dono/Gerente) | Versão `.webp` ao lado de cada JPG/PNG, entregue a navegadores compatíveis; e-mails e prévias continuam com JPG/PNG. |

## Crescimento, fidelização e gestão (novembro/2026 — parte 2)

| Recurso | Onde fica | Observações |
|---|---|---|
| Troca Garantida | Automático em iPhones novos · Painel → Troca Garantida · `/troca-garantida` | Certificado no recibo; libera em 12 meses por 90 dias; A/B/C = 60/50/40% do valor pago (configurável). Resgate gera crédito `TROCA-…` de uso único. Benefício incluído (sem taxa — evita nota de serviço). |
| Pré-venda / Em breve | Produto → “Em breve / pré-venda” · Painel → Pré-venda | “Me avise” grátis + fila por sinal (pedido `kind='sinal'`, sem estoque/NF-e). Fila = ordem de pagamento. “Chegou!” libera o produto e avisa todos. Venda final desconta o sinal. |
| Vitrine Google/Instagram | `/feed/google.xml` (= `/feed/meta.xml`) | Cadastrar uma vez no Google Merchant Center e no Gerenciador de Commerce da Meta. Só produtos com foto e preço. |
| Guias (blog) | Painel → Guias · `/guias` | 3 guias iniciais (`database/guias-iniciais.js`). Formatação simples e segura; `[produto:slug]` mostra o card. |
| Vídeos do produto | Cadastro do produto | YouTube/Shorts, Reels e TikTok; o player só carrega no toque. |
| Avaliações do Google | Configurações (Dono) | Places API (New): chave + Place ID; cache 12 h. Teste: `GPLACES_URL`. |
| Clube Aladdin | Minha conta → Clube · Configurações | Cashback Prata/Ouro/Diamante (2/3/5%) por gasto em 12 meses; vale 180 dias; paga até 30% da compra; presente de aniversário. Balcão ligado pelo WhatsApp da conta. |
| Lembretes automáticos | Automático (a cada 6 h) | Garantia acabando (30 dias), 2 anos de iPhone, película a cada 6 meses (ofertas só com consentimento). |
| App instalável (PWA) | `manifest.webmanifest`, `sw.js`, `offline.html` | Instala no celular, funciona offline e recebe notificações (Web Push próprio, VAPID gerado sozinho). Painel → Notificações envia ofertas. iPhone: só com o app instalado (iOS 16.4+). |
| Laudo técnico | Produto seminovo → “Emitir laudo técnico” · `/laudo/<token>` | 31 itens, IMEI parcialmente oculto, pronto para PDF. |
| Nossa história | `/nossa-historia` · Configurações | Texto, números (só reais), trajetória, Reclame Aqui, nota do Google, CEO, equipe e fotos. |
| Assistência técnica | Painel → Assistência técnica · `/assistencia` | OS com comprovante (`/os/<token>`), orçamento aprovado pelo cliente no site, avisos por e-mail/WhatsApp, garantia do serviço. |
| Financeiro | Painel → Financeiro (só Dono) | Lucro real (custo da época/da unidade), margem, giro, parados > 60 dias, sugestão de compra, valor em estoque. |
| Estoque por IMEI | Produto → “Controlar por unidade” · Painel → Estoque (IMEI) | Entrada por IMEI com custo/origem; estoque = unidades disponíveis; FIFO no site; o mesmo aparelho nunca é vendido duas vezes. |
| Mercado Livre e Shopee | Configurações (Dono) · código do anúncio no produto | ML: OAuth + `/api/ml/notify` (orders_v2). Shopee: Open Platform v2 assinada + `/api/shopee/notify`. Estoque sincronizado a cada 2 min. Testes: `ML_API_URL`, `ML_AUTH_URL`, `SHOPEE_API_URL`. |

Segurança: chaves secretas sempre mascaradas no painel e chaves exclusivas do Dono nem chegam ao Gerente (corrigido nesta versão).

## Nível enterprise — segurança, desempenho e prova social (novembro/2026 — parte 3)

| Área | O que foi feito |
|---|---|
| Dependências | `nodemailer` atualizado (6.x → 10.2.1, corrige ~20 falhas graves conhecidas) e `compression` 1.8.2. `npm audit`: **0 vulnerabilidades**. |
| CSRF | Toda alteração via `/api` só é aceita vinda do próprio site (cabeçalho Origin). Exceções: webhooks do Mercado Pago, Mercado Livre e Shopee, que têm assinatura própria. |
| Limites | Corpo de requisição limitado a 200 KB (15 MB só nas rotas com envio de fotos). |
| Senhas | Bloqueio das senhas mais vazadas (ex.: `senha1234`, `Senha12345`, `admin123`) e tamanho máximo de 128 caracteres. |
| Cabeçalhos | HSTS de 2 anos com `preload`, `Cross-Origin-Resource-Policy` na API, `X-Permitted-Cross-Domain-Policies`. Dados pessoais, painel e documentos com `Cache-Control: no-store`. |
| Vitrine | A API pública não expõe mais IDs do ML/Shopee, estoque enviado aos canais, NCM nem vendas anteriores. O custo já não era exposto. |
| Backups | Cópia automática diária do banco (`data/backups`, mantém 14 dias) via `VACUUM INTO`. O Dono pode fazer backup manual e baixar em **Painel → Segurança**. Todas as ações ficam registradas. |
| Contato de segurança | `/.well-known/security.txt` (padrão RFC 9116). |
| Velocidade | Compressão Brotli/Gzip. Arquivos JS/CSS com impressão digital (`?v=hash`) e cache de 1 ano (`immutable`). Imagens com cache de 7 dias. |
| Cache da API | Cache de 20 s em produtos, categorias, avaliações e configurações, limpo automaticamente a cada alteração. |
| Banco | SQLite com `synchronous=NORMAL`, `busy_timeout`, cache de 16 MB e 7 índices novos. |
| Navegador | O site abre instantaneamente com os dados guardados no aparelho (localStorage) e atualiza em segundo plano. O app/PWA mostra a vitrine mesmo sem internet. |
| Mais vendidos | Selo **Mais vendido** e “**1º mais vendido em iPhone**”, no estilo Mercado Livre. Ranking calculado só com pedidos efetivados (cancelados e sinais de pré-venda não contam); os últimos 90 dias pesam mais. São necessárias pelo menos 3 vendas para receber o selo. |
| Página e ordenação | Página `/mais-vendidos` com abas por categoria, seção na página inicial, item no menu e ordenação “Mais vendidos” / “Melhor avaliados” na loja. |
| Vendidos e notas | “**+N vendidos**” em faixas (+5, +10, +25, +50, +100…), como Shopee e Mercado Livre. Nota com estrelas e número de avaliações em cada card e na página do produto. |
| Vendas antes do site | Campo **Vendas antes do site** no cadastro do produto, para incluir o histórico real da loja. |

## Publicar na Vercel (Supabase + Vercel Blob)

O mesmo código roda em dois modos:

| Modo | Banco | Fotos | Tarefas automáticas |
|---|---|---|---|
| Computador ou servidor próprio (`npm start`) | `data/loja.db` (SQLite do Node) | `public/uploads` | `setInterval` |
| Vercel (variável `VERCEL`, definida pela própria Vercel) | Supabase / Postgres (`POSTGRES_URL`) | Vercel Blob | A cada acesso, em segundo plano, e pelo agendamento diário em `/api/cron` |

**Como funciona:** `db.js` mantém a interface síncrona do SQLite (`db.prepare().get/all/run`). Na nuvem, um *worker* (`db-worker.js`) executa as consultas no Supabase e a linha principal aguarda a resposta. `pg-compat.js` traduz o SQL de cada consulta para o Postgres: parâmetros, `LIKE`, datas (`datetime`, `date` e `strftime` são recriadas como funções no banco), `INSERT OR IGNORE`, `MAX(a,b)` e os tipos das tabelas. Também aceita Turso (`TURSO_DATABASE_URL`) no lugar do Supabase.

**Passo a passo:**
1. Na Vercel, importe o repositório do GitHub (*Add New → Project*).
2. Em *Storage*, crie e conecte ao projeto, marcando os 3 ambientes:
   - **Supabase** (Marketplace), que cria `POSTGRES_URL` e as outras chaves.
   - **Blob**.
3. Em *Settings → Environment Variables*, adicione:
   - `CRON_SECRET`: uma senha longa qualquer, usada pelo agendamento diário.
   - `PUBLIC_URL`: o endereço do site, por exemplo `https://aladdintech.com.br`.
   - `ADMIN_INITIAL_PASSWORD`: opcional. Só é usada se o banco estiver vazio. Sem ela, a senha provisória do `admin` aparece em *Logs*.
4. Leve os dados do computador para a nuvem: produtos, equipe, configurações e fotos.
   ```
   npx vercel env pull .env.local --environment=production
   node tools/migrar-para-nuvem.js
   ```
   A ferramenta só roda num banco da nuvem vazio. Para copiar de novo, use `--substituir`.
5. Faça um novo *Deploy*.

**Observações:**
- O plano Hobby da Vercel é só para uso pessoal, não comercial. Uma loja precisa do plano Pro.
- No plano Hobby, o agendamento roda 1 vez por dia. As demais tarefas rodam conforme o site recebe visitas.
- **Backups:** o Supabase faz cópias diárias do banco. Em *Painel → Segurança*, o Dono baixa uma cópia completa (JSON) na hora.
