-- db/seed_products.sql — produtos iniciais da Loja (rode DEPOIS do schema.sql).
-- Espelha config/catalogo.yaml. Produtos já entram como `active` (aparecem na loja).
-- url_base dos afiliados fica NULL → você cola o link real no /admin/catalogo; até lá o
-- /k e /r caem no portal. Ajuste preço/checkout/afiliado_fonte pelo painel.

insert into products
  (id, slug, nome, descricao, tipo, status, destaque, prioridade, tags, gatilho, busca,
   url_base, gratis, manychat_word, disclosure_obrigatorio, cta_sugerido, gancho)
values
  ('curso','curso-100kg','100kg – Domínio Absoluto',
   'Curso gratuito de jogo de pressão e controle — a isca que leva do conteúdo ao aprofundamento.',
   'curso','active', true, 1,
   '{"controle","pressao","base","guarda","passagem","fundamentos","gi","nogi","iniciante","evergreen"}',
   'conteúdo técnico/didático de controle, pressão, base ou leitura de jogo', null,
   'https://alohabjjnews.com/', true, 'CURSO', false,
   'Curso 100kg – Domínio Absoluto, grátis no link', 'Curso gratuito de pressão e controle.'),

  ('bjj3d','loja-bjj3d','Loja BJJ3D',
   'Produtos exclusivos de impressão 3D pra quem vive o Jiu-Jitsu dentro e fora do tatame.',
   'impressao_3d','active', false, 2,
   '{"produto","loja","lifestyle","presente","marca","3d"}',
   'quando cabe um produto de marca própria', null,
   null, false, 'LOJA', false, '🛒 Loja BJJ3D no link', 'Produtos 3D exclusivos AlohaBJJ.'),

  ('hayabusa','gear-hayabusa','Equipamento Hayabusa',
   'Equipamento de alto desempenho — cupom LUCAS -10%.',
   'afiliado','active', false, 3,
   '{"equipamento","gear","kimono","luva","protecao","marca-parceira"}',
   'pauta sobre equipamento/gear de alto desempenho', 'hayabusa jiu jitsu',
   null, false, 'GEAR', true, '🥊 Hayabusa com cupom LUCAS -10% (parceria)',
   'Equipamento Hayabusa de alto desempenho — cupom LUCAS -10%.'),

  ('gi-competicao','kimono-competicao','Kimono de competição (campeão de vendas)',
   'O kimono que aguenta um campeonato inteiro — resistência e caimento de competição.',
   'afiliado','active', false, 3,
   '{"gi","kimono","competicao","mundial","ibjjf","faixa-preta","absoluto"}',
   'pauta de GI / campeonato IBJJF / final de Mundial', 'kimono jiu jitsu competição trançado',
   null, false, 'GI', true, '🥋 Kimono de competição (parceria) — link',
   'O kimono que aguenta um campeonato inteiro.'),

  ('rashguard-nogi','rashguard-nogi','Rashguard / gear No-Gi (campeão de vendas)',
   'Rashguard que segura pegada e suor numa guerra de No-Gi.',
   'afiliado','active', false, 3,
   '{"nogi","no-gi","adcc","grappling","rashguard","submission","superluta"}',
   'pauta No-Gi / ADCC / superluta de grappling', 'rashguard jiu jitsu no gi manga longa',
   null, false, 'NOGI', true, 'Rashguard No-Gi (parceria) — link',
   'Rashguard que segura pegada e suor no No-Gi.'),

  ('instrucional-leglock','instrucional-leglock','Instrucional de leg locks (campeão de vendas)',
   'Aprofunde o jogo de perna com quem domina.',
   'afiliado','active', false, 3,
   '{"leglock","leg-lock","heelhook","heel-hook","ankle-lock","nogi","finalizacao","perna"}',
   'pauta com leg lock / heel hook / finalização de perna', null,
   null, false, 'PERNA', true, '📚 Instrucional de leg locks (parceria) — link',
   'Aprofunde o jogo de perna com um instrucional de referência.'),

  ('instrucional-guarda','instrucional-guarda','Instrucional de guarda/passagem (campeão de vendas)',
   'Sistematize sua guarda/passagem com um instrucional de referência.',
   'afiliado','active', false, 3,
   '{"guarda","passagem","de-la-riva","x-guard","meia-guarda","raspagem","gi","tecnica"}',
   'breakdown técnico de guarda, passagem ou raspagem', null,
   null, false, 'GUARDA', true, '📚 Instrucional de guarda/passagem (parceria) — link',
   'Sistematize sua guarda/passagem.'),

  ('instrucional-costas','instrucional-costas','Instrucional de costas / mata-leão (campeão de vendas)',
   'Feche o jogo pelas costas com um sistema testado no alto nível.',
   'afiliado','active', false, 3,
   '{"costas","back-control","mata-leao","estrangulamento","finalizacao"}',
   'pauta sobre pegada nas costas, mata-leão ou estrangulamento', null,
   null, false, 'COSTAS', true, '📚 Instrucional de costas/mata-leão (parceria) — link',
   'Feche o jogo pelas costas com um sistema testado.')
on conflict (id) do nothing;
