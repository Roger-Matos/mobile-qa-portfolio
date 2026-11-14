# Mobile QA Portfolio

[English](README.en.md) · [Execuções no GitHub Actions](https://github.com/Roger-Matos/mobile-qa-portfolio/actions/workflows/mobile.yml) · [Relatório Allure](https://roger-matos.github.io/mobile-qa-portfolio/)

Suíte E2E para o Gotify no Android. A API cria usuários, aplicações emissoras e mensagens com IDs próprios por cenário. O Appium usa a UI nativa para validar entrega, filtragem, exclusão e troca de conta. Quando a interface altera o estado, a suíte consulta o backend para confirmar o resultado persistido.

## Cobertura

| Cenário | Massa via API | Validação |
| --- | --- | --- |
| Entrega em tempo real `@smoke` | Usuário, aplicação e mensagem inicial | Uma segunda mensagem chega à caixa aberta, sem atualizar a tela. |
| Filtro por aplicação | Duas aplicações, uma mensagem por aplicação | A caixa geral exibe ambas. O filtro exibe apenas a mensagem selecionada. |
| Exclusão persistida | Mensagem alvo e mensagem de controle | A UI exclui a mensagem. Após expirar a opção de desfazer, a API confirma a remoção pelo ID e a UI mantém a mensagem de controle. |
| Isolamento entre contas | Dois usuários e mensagens distintas | A API retorna a lista de cada conta e a troca de sessão na UI respeita o mesmo isolamento. |

## Arquitetura

Os [specs](test/specs/) expressam os cenários. Os [flows](test/flows/) coordenam jornadas e asserções entre API e UI. As [screens](test/screens/) concentram ações e esperas com [seletores](test/selectors/) nativos. As [fixtures](test/fixtures/) usam o [cliente REST](test/services/) para criar e remover a massa.

Na exclusão, a fixture retorna os IDs da mensagem alvo e da mensagem de controle. O flow usa o título exclusivo para localizar o card e usa o ID para validar a listagem REST depois que a janela de desfazer termina. Cada cenário começa com dados do app limpos. A fixture remove os usuários que criou mesmo quando o cenário falha. O runner encerra o servidor e descarta o SQLite temporário ao final.

## Executar localmente

Use Windows ou Linux x64, Node.js 24 e `tar`. Para os cenários mobile, use Java 21, Android SDK com `ANDROID_HOME` configurado e um emulador Android API 35 iniciado e desbloqueado. Use um AVD dedicado ao Gotify, pois a suíte limpa os dados do app. Com vários emuladores, defina `ANDROID_SERIAL` para selecionar um deles.

```sh
npm ci
npm run setup
npm run lint
npm run typecheck
npm run test:api
npm run test:smoke
npm test
npm run report
```

O contrato REST funciona sem emulador. O setup baixa os binários oficiais e verifica seus SHA-256. O runner configura o servidor em loopback e conecta o app via `adb reverse`. Abra `allure-report/index.html` por um servidor HTTP local ou execute `npx allure open allure-report`. [APK v2.10.1](https://github.com/gotify/android/releases/tag/v2.10.1) · [Servidor v3.1.1](https://github.com/gotify/server/releases/tag/v3.1.1)

## CI/CD e diagnóstico

Pull requests rodam lint, typecheck, contrato REST e smoke no emulador. O **Mobile Quality Gate** depende das duas etapas. Pushes em `main`, execuções manuais e a execução semanal rodam a regressão. Uma regressão aprovada em `main` publica seu Allure no GitHub Pages com o commit testado.

O resumo do workflow identifica a etapa e as versões testadas. Os artefatos do Actions incluem logs de provisionamento e o Allure da execução. Em falhas com sessão ativa, o relatório inclui a hierarquia da UI e uma captura de tela quando o campo de senha estiver limpo. Os dados dos cenários são sintéticos e os tokens e senhas ficam fora dos artefatos.
