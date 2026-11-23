---
id: skill-devops-versioning-ota
version: 1.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia + ReformAI
compatible_subagent: shapelab-mobile-ui / shapelab-backend-qa
stack: [flutter, dart, python, github-actions, firebase-hosting, pwa]
---

# Skill: Versionamento Monotônico, Anti-Cache PWA/OTA e Rastreabilidade SemVer

## 1. Objetivo
Padronizar o ciclo completo de versionamento nos produtos ShapeLab: cálculo automático e monotônico de `buildNumber` (`YYYYMMDDNN` seguro para 32 bits), sincronização Single-Source-of-Truth no Flutter/PWA, blindagem contra cache stale de manifests, detecção de atualização OTA em tempo real no cliente, limpeza de quota do Firebase Hosting e metadados `SemVer+build.<run>.<sha>` para backends e auditoria.

## 2. Contrato de Entrada e Dependências
- **Flutter / PWA (`mobile/`):**
  - `pubspec.yaml` (`version: X.Y.Z+YYYYMMDDNN`)
  - `lib/core/config/app_config.dart` (`appVersion`, `buildNumber`, `buildDate`, `releaseNotes`)
  - `lib/core/config/app_changelog.dart` (`AppChangelog.history` com `targetRoles`)
  - `web/version.json` (`version`, `build`, `updated_at`, `notes`, `changelog`)
  - `web/index.html` (`const APP_CURRENT_BUILD = ...;` + `initAssetCacheGuard`)
- **Backend / CI/CD:**
  - `package.json` ou `pyproject.toml` como fonte da versão base (`MAJOR.MINOR.PATCH`).
  - Variáveis de ambiente CI: `GITHUB_SHA` (ou `COMMIT_SHA`), `GITHUB_RUN_NUMBER` (ou `BUILD_NUMBER`), `GITHUB_OUTPUT`, `FIREBASE_SERVICE_ACCOUNT`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- **Overflow de 32 bits no `versionCode` (Android/iOS):** Usar timestamp epoch em milissegundos estoura o limite de inteiro assinado 32 bits (`2147483647`). O padrão obrigatório é `YYYYMMDDNN` (10 dígitos, ex: `2026111604`), calculado via `git rev-list --count --since=hoje` com sequência diária limitada a `98` (`clamp(1, 98)`) e garantia monotônica de nunca ser menor que o `buildNumber` atual.
- **Tela branca / fontes quebradas no Flutter Web pós-deploy:** Browsers e Service Workers frequentemente servem `AssetManifest`, `FontManifest` ou `version.json` de cache antigo após um novo deploy. Intercepte `window.fetch` no `web/index.html` anexando `?_b=APP_CURRENT_BUILD` com `cache: 'no-store'`.
- **Loop infinito no banner de atualização:** O detector OTA (`PwaUpdateWrapper`) só deve exibir o banner quando `serverBuild > AppConfig.buildNumber`. Se `serverBuild <= localBuild`, deve chamar `reset()` imediatamente para limpar alertas espúrios.
- **Quota 429 no Firebase Hosting:** Deploys frequentes acumulam versões finalizadas/abandonadas e estouram a cota do Firebase Hosting. Execute uma rotina de GC via REST API (`firebasehosting.googleapis.com/v1beta1`) preservando a versão `live` + 2 versões `FINALIZED` recentes para rollback e deletando o restante antes do deploy.

## 4. Implementação Agnóstica (Boilerplate Blindado)

### (a) Núcleo Dart — Cálculo de Build `YYYYMMDDNN` e Sincronização (`tool/update_version.dart`)
```dart
// Cálculo monotônico YYYYMMDDNN seguro para 32-bit int
final now = DateTime.now().toUtc();
final year = now.year.toString().padLeft(4, '0');
final month = now.month.toString().padLeft(2, '0');
final day = now.day.toString().padLeft(2, '0');
final todayPrefix = '$year$month$day';

int todayCommitCount = 0;
final todayRes = Process.runSync(
  'git',
  ['rev-list', '--count', '--since=$year-$month-${day}T00:00:00Z', 'HEAD'],
  workingDirectory: mobileDir.path,
);
if (todayRes.exitCode == 0) {
  todayCommitCount = int.tryParse(todayRes.stdout.toString().trim()) ?? 0;
}

final dailySeq = (todayCommitCount + 1).clamp(1, 98);
final todayDynamicCandidate = int.parse('$todayPrefix${dailySeq.toString().padLeft(2, '0')}');
int newBuildNumber = (currentBuild.toString().length == 10 && currentBuild.toString().startsWith(todayPrefix))
    ? (todayDynamicCandidate > currentBuild + 1 ? todayDynamicCandidate : currentBuild + 1)
    : (todayDynamicCandidate > currentBuild ? todayDynamicCandidate : currentBuild + 1);

// Sincronizar em sequência:
// 1. pubspec.yaml -> version: $targetSemVer+$newBuildNumber
// 2. lib/core/config/app_config.dart -> appVersion, buildNumber, buildDate, releaseNotes
// 3. lib/core/config/app_changelog.dart -> version e buildNumber do topo
// 4. web/version.json -> { version, build, updated_at, notes, changelog }
// 5. web/index.html -> const APP_CURRENT_BUILD = $newBuildNumber;
```

### (b) Snippet JS — Blindagem Anti-Cache (`web/index.html`)
```javascript
const APP_CURRENT_BUILD = 2026111604;

(function initAssetCacheGuard() {
  try {
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function(input, init) {
        try {
          const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (url && (url.includes('AssetManifest') || url.includes('FontManifest') || url.includes('version.json'))) {
            const sep = url.includes('?') ? '&' : '?';
            const bustedUrl = url.includes('_b=') ? url : (url + sep + '_b=' + APP_CURRENT_BUILD);
            return originalFetch.call(this, bustedUrl, Object.assign({}, init || {}, { cache: 'no-store' }));
          }
        } catch (_) {}
        return originalFetch.apply(this, arguments);
      };
    }
  } catch (_) {}
})();
```

### (c) Núcleo Flutter — Detector OTA (`PwaUpdateWrapper._checkForUpdate`)
```dart
// No initState: Timer.periodic(const Duration(minutes: 2), (_) => _checkForUpdate());
// No didChangeAppLifecycleState: if (state == AppLifecycleState.resumed) _checkForUpdate();
Future<void> _checkForUpdate() async {
  if (_isChecking) return;
  _isChecking = true;
  try {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final uri = kIsWeb
        ? Uri.base.resolve('/version.json?_t=$timestamp')
        : Uri.parse('$cleanBase/version.json?_t=$timestamp');
    final response = await http.get(uri).timeout(const Duration(seconds: 5));
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final serverBuild = int.tryParse(data['build']?.toString() ?? '0') ?? 0;
      final serverVersion = data['version']?.toString() ?? '';
      if (serverBuild > AppConfig.buildNumber) {
        PwaUpdateNotifier.instance.setUpdateAvailable(serverVersion, serverBuild, data);
      } else {
        PwaUpdateNotifier.instance.reset();
      }
    }
  } catch (_) {
  } finally {
    _isChecking = false;
  }
}
```

### (d) Backend / Auditoria — `version.py` (`ReformAI`)
```python
def compute_version_metadata():
    clean_semver = get_base_version()  # lido de package.json ou pyproject.toml
    sha = (os.environ.get("GITHUB_SHA") or os.environ.get("COMMIT_SHA") or get_git_short())[:7]
    build_num = os.environ.get("GITHUB_RUN_NUMBER") or os.environ.get("BUILD_NUMBER") or "dev"
    build_metadata = f"build.{build_num}.{sha}"
    return {
        "version": f"{clean_semver}+{build_metadata}",
        "clean_semver": clean_semver,
        "docker_tag": f"{clean_semver}-build.{build_num}.{sha}",
        "release_tag": clean_semver,
        "git_tag": f"v{clean_semver}",
        "git_sha": sha,
        "build_number": build_num,
    }
# Suporta --github-output para exportar version, clean_semver, docker_tag, release_tag, git_tag, git_sha, build_number
```

### (e) Step no GitHub Actions (antes do `flutter build web`)
```yaml
      - name: Auto-Versionamento PWA & Build Stamp
        run: |
          cd mobile
          dart run tool/update_version.dart

      - name: Build Flutter Web Release
        run: |
          cd mobile
          flutter build web --release --base-href "/" --dart-define=API_BASE_URL="${{ vars.API_BASE_URL }}"
```

## 5. Critério de Aceite e Testes Adversariais
1. Executar `dart run tool/update_version.dart` gera `buildNumber` de 10 dígitos (`YYYYMMDDNN < 2147483647`), estritamente maior que o anterior, e atualiza todos os arquivos-alvo em sincronia.
2. Emulação de deploy com `serverBuild > AppConfig.buildNumber` exibe o banner de atualização uma única vez; com `serverBuild <= AppConfig.buildNumber` executa `reset()` sem loop.
3. No backend/CI, `version.py --github-output` e `--docker` produzem tags OCI válidas (`MAJOR.MINOR.PATCH-build.<run>.<sha>`).
