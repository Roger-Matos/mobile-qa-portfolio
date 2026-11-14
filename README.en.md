# Mobile QA Portfolio

[Português](README.md) · [GitHub Actions runs](https://github.com/Roger-Matos/mobile-qa-portfolio/actions/workflows/mobile.yml) · [Allure report](https://roger-matos.github.io/mobile-qa-portfolio/)

An Android E2E suite for Gotify. The API provisions users, sending applications, and messages with scenario-specific IDs. Appium exercises the native UI to verify delivery, filtering, deletion, and account switching. When the UI changes state, the suite queries the backend to verify the persisted result.

## Coverage

| Scenario | API fixture | Verification |
| --- | --- | --- |
| Real-time delivery `@smoke` | User, application, and initial message | A second message appears in the open inbox without a refresh. |
| Filter by sending application | Two applications with one message each | The full inbox shows both messages. Selecting a filter shows only its message. |
| Persisted deletion | Target and control messages | The UI deletes the target. After the undo window expires, the API confirms removal by ID and the UI still shows the control message. |
| Account isolation | Two users with distinct messages | Each account's API list is scoped to that account, and the UI respects the same boundary after switching sessions. |

## Architecture

[Specs](test/specs/) describe behavior. [Flows](test/flows/) orchestrate user journeys and assertions across the API and UI. [Screens](test/screens/) own actions and waits using native [selectors](test/selectors/). [Fixtures](test/fixtures/) use the [REST client](test/services/) to provision and clean up test data.

For deletion, the fixture returns IDs for both the target and control messages. The flow uses the unique title to find the card and the ID to check the REST list after the undo window ends. Each scenario starts with clean app data. The fixture removes the users it created even if a scenario fails. The runner stops the server and discards its temporary SQLite database when it exits.

## Run locally

Use Windows or Linux x64 with Node.js 24 and `tar`. Mobile scenarios also require Java 21, the Android SDK with `ANDROID_HOME` configured, and a booted, unlocked Android API 35 emulator. Use a dedicated Gotify AVD as the suite clears the app's data. If several emulators are running, set `ANDROID_SERIAL` to select one.

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

The REST contract works without an emulator. Setup downloads the official binaries and verifies their SHA-256 hashes. The runner binds the server to loopback and connects the Android app with `adb reverse`. Serve `allure-report/index.html` over local HTTP or run `npx allure open allure-report`. [APK v2.10.1](https://github.com/gotify/android/releases/tag/v2.10.1) · [Server v3.1.1](https://github.com/gotify/server/releases/tag/v3.1.1)

## CI/CD and diagnostics

Pull requests run lint, type checking, the REST contract, and emulator smoke. The **Mobile Quality Gate** depends on both stages. Pushes to `main`, manual runs, and the weekly schedule run the regression. A passing regression on `main` publishes its Allure report to GitHub Pages with the tested commit.

The workflow summary identifies the stage and tested versions. Actions artifacts include provisioning logs and the run's Allure report. Failures with an active session include the UI hierarchy and a screenshot when the password field is clear. Scenario data is synthetic, and passwords and tokens stay out of artifacts.
