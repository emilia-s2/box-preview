# Box Preview

Veja os conteúdos declarados de uma caixa antes de comprar ou abrir, usando os dados do cliente TERA conectado. Funciona com itens do inventário, broker e TERA Rewards; não exige possuir a caixa.

## Como usar

1. Abra Toolbox e TERA em janela ou sem bordas.
2. Deixe o tooltip do item visível, com o nome completo.
3. Use **Alt + clique esquerdo no ícone do item**. Para um item linkado no chat, abra primeiro o painel do próprio TERA e use o ícone desse painel.

A prévia permanece sobre o jogo até fechar pelo × ou Escape. Mostra o conteúdo compatível com seu personagem; marque **Mostrar todas as variantes** para ver as demais. **Ctrl+Alt+B** abre a janela maior para consulta por ID e listas opcionais.

A leitura dentro das propriedades do painel também existe, mas pode falhar se o título não for reconhecido. Alt + clique diretamente no texto do link do chat não é um fluxo confirmado. O uso pelo ícone do tooltip foi confirmado no jogo na **0.2.14**.

## Experimentar a roupa

Clique no botão de olho ao lado de uma variante compatível para abrir a prévia nativa de aparência do TERA, como no broker. O mod oculta suas janelas para deixar o personagem visível. Feche a prévia pelos controles do jogo e use Alt + clique esquerdo para consultar outra caixa.

Skins de armas também usam esse botão, com a classe conferida pelo tipo e pelas restrições do item no cliente.

O botão aparece para roupas e acessórios com modelo visual confirmado no cliente e restrições compatíveis de raça, gênero e classe. Ele envia apenas `S_PREVIEW_ITEM` ao cliente; não exige possuir a roupa, não compra, não abre a caixa nem equipa itens.

## Idioma

O seletor de idioma fica na janela completa (**Ctrl+Alt+B**) e oferece **Automático**, **Português**, **English** e **Español (Latinoamérica)**. A janela pequena segue a mesma preferência, sem seletor próprio. No modo automático, o idioma segue o Windows; idiomas não suportados usam inglês. Uma escolha manual tem prioridade e atualiza as duas janelas imediatamente, sem consultar novamente o item.

A preferência é criada localmente em `config.json`, no formato `{"version":1,"data":{"language":"auto"}}`. Os valores aceitos são `auto`, `pt`, `en` e `es`. A escolha é preservada após recarregar o mod ou reiniciar o Toolbox. Configurações existentes são preservadas; uma falha de gravação não confirma uma preferência que não foi salva.

Nomes e descrições dos itens continuam no idioma fornecido pelo cliente conectado. O idioma da interface não altera a captura, o OCR, os IDs, as variantes ou os atalhos.

**Não publique nem copie `config.json` sobre a configuração de outro usuário.** O arquivo e seus temporários são ignorados pelo Git e excluídos do instalador de atualização. O pacote contém o migrador e cria os padrões no computador do usuário.

## Comandos

| Comando | Função |
| --- | --- |
| `/8 boxpreview` ou Ctrl+Alt+B | Janela completa. |
| `/8 boxpreview ID` | Consultar um ID. |
| `/8 boxpreview status` | Versão, servidor conectado e estado do atalho. |
| `/8 boxpreview refresh` | Atualizar a lista da origem selecionada. |
| `/8 toolbox reload box-preview` | Carregar a atualização sem reiniciar TERA ou Toolbox. Reabra a loja se precisar receber sua lista novamente. |

## Identificação e conteúdo

O mod observa os IDs enviados pelo jogo. Um ID recente e confirmado no ponto clicado tem prioridade e dispensa OCR. Identificadores de unidades (`dbid`) mantêm os 64 bits e são cruzados com as listas recebidas; não são tratados como IDs de itens. Eventos atrasados e tooltips fixados não substituem automaticamente o item atual.

Quando não há ID seguro, o OCR do Windows lê o título da captura e o confere com os nomes do cliente conectado. O índice de nomes é reutilizado. Em Rewards, a posição do item pode ser associada à lista recebida da loja, com confirmação do nome. Não há cadastro manual de caixas.

A captura do clique e uma captura anterior válida podem ser analisadas mesmo depois de o mouse sair do ícone. Se ambas estiverem sem título legível, novas capturas só são aceitas na posição e janela originais. Clicar antes de aparecer o tooltip e mover imediatamente o mouse não garante identificação. A máscara exclui janelas do Toolbox que estejam acima do TERA, preservando janelas atrás dele ou minimizadas.

Nomes iguais podem representar caixas diferentes. O mod usa IDs confirmados, a lista de Rewards e, quando reconhecida, a qualidade verde/azul do título declarada pelo cliente. Se os conteúdos não puderem ser distinguidos com segurança, mostra um aviso.

As variantes vêm de `ItemConversion / SeedItem / FixedItem` do DataCenter conectado. No Asura, quando uma caixa conhecida pelo cliente não declara sua conversão, o mod pode consultar o catálogo público `tera-asura.com/en/item/ID`, conferindo ID e nomes com o cliente. Essa origem é informada na prévia; quantidades e probabilidades ausentes são omitidas. A consulta ao catálogo requer conexão com o site.

## Limites e diagnóstico

Nem toda caixa declara conteúdos no cliente. Regras aleatórias, seletores e alterações exclusivas do servidor podem estar indisponíveis. Ausência de dados não significa caixa vazia. OCR requer um idioma de reconhecimento instalado no Windows e texto legível. Tela cheia exclusiva não é suportada pela janela externa.

O mod não envia compra, abertura ou uso de itens, não modifica arquivos do jogo e não injeta DLL/GPK. As imagens permanecem temporariamente na memória; o diagnóstico de imagens usado durante o desenvolvimento foi retirado. O leitor é encerrado no lobby ou ao descarregar o mod, e não consulta o DataCenter durante a criação de personagens.

`diagnostics/last-pointer.json` registra a última consulta; `last-failure.json` preserva a última falha. `input-state.json` contém o estado do leitor e `inventory.json` a lista consultada. Esses arquivos são limitados, substituídos e podem conter trechos do texto reconhecido. **Não inclua a pasta diagnostics na publicação.** Testes e backups ficam fora da pasta instalada do mod.
