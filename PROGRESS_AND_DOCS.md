# Dois Amores Açaíteria e Sorveteria — Documentação e Progresso

## Status das Fases
- **Fase 1 (Auditoria):** Concluída. Projeto inicial React + Vite + Express + TypeScript inspecionado; infraestrutura Firebase (Firestore + Google Auth) provisionada e regras de segurança implantadas.
- **Fase 2 (Implementação):** Concluída. Loja pública, personalizador de açaí/sorvete, sacola, checkout com cálculo no servidor, acompanhamento em tempo real, avaliações pós-compra (1 a 5 estrelas), chat em tempo real, painel administrativo completo (13 áreas + moderação de avaliações) e PWA instalável.
- **Fase 3 (Integração):** Concluída. Todos os módulos sincronizam via Firestore (`onSnapshot`) e API Express (`/api/orders/prepare`, `/api/upload`, `/api/webhooks/pix`).
- **Fase 4 (Testes e Validação):** Verificação de TypeScript (`tsc --noEmit`), ESLint de regras Firestore (`@firebase/eslint-plugin-security-rules`) e build Vite (`npm run build`).
- **Fase 5 (Redesign Premium 3D):** Concluída. Identidade visual elevada com paleta `#4A123F`, `#781B68`, `#310D2B`, `#FFF5EB`, `#FFFFFF` e `#E6AE52`; cards 3D com sombras em múltiplas camadas e glow neon roxo suave (`.da-card-3d`, `.da-admin-card`); botões táteis 3D (`.da-btn-3d`, `.da-btn-gold`); animações progressivas no scroll via `IntersectionObserver` (`ScrollReveal`) respeitando `prefers-reduced-motion`; banner hero em carrossel com parallax sutil; categorias circulares horizontais com aba dedicada de Adicionais; favoritar produtos persistido em `localStorage`; banner de oferta exclusiva `DOISAMORES10`; barra inferior fixa estilo app no mobile; gaveta de carrinho animada; e painel administrativo alinhado à nova estética mantendo 100% do banco de dados e regras de negócio intactos.
- **Fase 6 (Catálogo Mobile em Carrosséis Horizontais + `/cardapio`):** Concluída. Página inicial reestruturada com até 5 fileiras independentes de carrossel horizontal (`ProductCarouselRow`, limite de até 6 produtos reais por fileira, scroll snap, indicador de continuidade no swipe e setas no desktop), cards compactos (`154px` no mobile, foto `118px`) mantendo 2+ cards visíveis lado a lado, botão centralizado **VER TODOS OS PRODUTOS** e rota exclusiva `/cardapio` (`FullCatalogView`) com grid de 2 colunas no mobile, busca, filtros de categoria/preço/popularidade e paginação progressiva.
- **Fase 7 (Esquema de Avaliações no Firestore + Avaliações no Catálogo):** Concluída. Coleção `/users/{userId}` para perfis de clientes registrados via Google Auth, vínculo de `customerUid` em `/orders` e `/reviews` (`firebase-blueprint.json`, `firestore.rules`, `domain.ts`), médias de estrelas calculadas ao vivo no catálogo (`ProductCard`, `ProductCarouselRow`, `FullCatalogView` com ordenação "Melhor avaliados") e envio de avaliações pós-compra diretamente no modal do catálogo (`ProductCustomizerModal`).

## Banco de Dados e Estrutura (`firebase-blueprint.json` / `firestore.rules`)
- `storeSettings/main`: Identidade visual, cores dinâmicas, horários, taxas de entrega por bairro, pagamentos ativos, chave Pix e mensagem de loja fechada.
- `categories`, `products`, `addons`: Catálogo dinâmico gerenciado pelo administrador; exclusão de produtos usa arquivamento seguro (`archived: true`) para não quebrar históricos de pedidos.
- `coupons`: Cupons percentuais ou fixos com pedido mínimo, validade e limite de usos.
- `orders` + `orderTracking`: Separação de dados sensíveis (PII em `orders` acessível somente ao admin ou ao cliente dono) e visão pública por token não enumerável (`orderTracking/{trackingId}`) para acompanhamento em tempo real sem login obrigatório.
- `users`: Perfis de clientes registrados (`uid`, `displayName`, `email`, `photoUrl`, `role: 'customer'`) isolados por `request.auth.uid`.
- `reviews`: Avaliações de 1 a 5 estrelas vinculadas a `orderId` + `trackingId` + `productId` + `customerUid` (compra verificada nas regras do Firestore, bloqueando pedidos cancelados), criadas como `pending` e moderadas pelo administrador (`approved` / `rejected` + resposta), com leitura permitida ao próprio autor e ao público quando aprovadas.
- `expenses`, `payments`, `auditLogs`, `conversations` + `messages`, `admins`.

## Variáveis de Ambiente (`.env.example`)
- `ORDER_SIGNING_SECRET`: Segredo HMAC opcional para assinar resumos de pedidos no servidor (possui fallback seguro em memória quando não definido).
- `PIX_WEBHOOK_SECRET`: Segredo HMAC para validar webhooks reais de provedores Pix em `/api/webhooks/pix`.

## Como Usar
- **Acessar o Painel Administrativo:** Acesse `/admin` (ou clique em "Painel Administrativo" no rodapé da loja) e entre com o e-mail e senha administrativos configurados no Firebase Authentication (`inovaprotech@gmail.com`). No primeiro acesso, o catálogo inicial da Dois Amores é carregado automaticamente no Firestore caso ainda esteja vazio.
- **Cadastrar Produtos e Fotos:** No menu **Produtos**, clique em **Novo Produto**, envie uma foto (salva em armazenamento persistente `/uploads`) e defina preços, promoção, tamanhos e disponibilidade.
- **Administrar Pedidos:** Em **Pedidos**, acompanhe novos pedidos com alerta sonoro e visual em tempo real, avance os status (`Confirmar`, `Em preparação`, `Pronto p/ retirada` ou `Saiu p/ entrega`, `Concluir`), confirme pagamentos, imprima comandas ou cancele com justificativa.
- **Moderar Avaliações:** Após finalizar um pedido, o cliente pode avaliar cada produto na tela de acompanhamento. Em **Avaliações**, aprove para exibição na loja pública, responda ou oculte comentários.
- **Instalar como PWA:** No computador (Chrome/Edge) ou Android, clique em **Instalar Aplicativo** no banner inicial da loja. No iPhone/iPad (Safari), clique em **Instalar no iPhone** e siga o passo a passo (*Compartilhar → Adicionar à Tela de Início*).
