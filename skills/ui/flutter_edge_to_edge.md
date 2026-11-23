---
id: skill-ui-flutter-edge-to-edge
version: 2.0.0
status: production-verified
last_verified: 2026-11-22
origin_project: B2B-personal-ia
compatible_subagent: shapelab-mobile-ui
stack: [flutter, dart, material-3, dual-theme-wcag]
---

# Skill: Layout Imersivo Edge-to-Edge + Dual-Theme WCAG no Flutter

## 1. Objetivo
Configurar apps Flutter (Android, iOS e Web/PWA) para renderização imersiva de ponta a ponta (padrão Nubank/Itaú) com suporte nativo a **Dual-Theme (Dark/Light)** e contraste estrito WCAG AA/AAA.

## 2. Contrato de Entrada e Dependências
- **SDK:** Flutter >= 3.24 (Dart >= 3.5) com `useMaterial3: true`.
- **Android (`MainActivity.kt`):** `WindowCompat.setDecorFitsSystemWindows(window, false)`.

## 3. Armadilhas Conhecidas (Gotchas de Produção)
- Nunca envolva o `Scaffold` inteiro em um `SafeArea` (cria faixas pretas/brancas sólidas no topo e na barra de gestos).
- Defina `systemNavigationBarContrastEnforced: false` para remover o *scrim* translúcido cinza na barra de gestos do Android.
- **Dual-Theme WCAG:** Nunca use cores fixas (`Colors.black`, `Colors.white70`) em textos ou ícones de superfície; derive sempre de `Theme.of(context).colorScheme` e ajuste `darkSystemIcons` dinamicamente conforme `Theme.of(context).brightness`.

## 4. Implementação Agnóstica (Boilerplate)
```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void initEdgeToEdge() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarDividerColor: Colors.transparent,
      systemNavigationBarContrastEnforced: false,
    ),
  );
}

class EdgeToEdgeScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Color? backgroundColor;
  final bool? darkSystemIcons;
  final bool safeTop;
  final bool safeBottom;

  const EdgeToEdgeScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.bottomNavigationBar,
    this.backgroundColor,
    this.darkSystemIcons,
    this.safeTop = false,
    this.safeBottom = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isLight = theme.brightness == Brightness.light;
    final useDarkIcons = darkSystemIcons ?? isLight;

    final overlayStyle = SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarContrastEnforced: false,
      statusBarIconBrightness: useDarkIcons ? Brightness.dark : Brightness.light,
      statusBarBrightness: useDarkIcons ? Brightness.light : Brightness.dark,
      systemNavigationBarIconBrightness: useDarkIcons ? Brightness.dark : Brightness.light,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: Scaffold(
        backgroundColor: backgroundColor ?? theme.colorScheme.surface,
        extendBody: true,
        extendBodyBehindAppBar: true,
        appBar: appBar,
        body: SafeArea(top: safeTop, bottom: safeBottom, child: body),
        bottomNavigationBar: bottomNavigationBar,
      ),
    );
  }
}
```

## 5. Critério de Aceite
1. Fundo/header estende-se por trás do relógio e da barra de gestos sem faixas sólidas tanto no tema Dark quanto no Light.
2. Ícones da barra de status alternam automaticamente entre claros e escuros ao trocar o tema do app.
3. `flutter analyze` com zero avisos e widget tests validando ausência de `RenderFlex overflowed`.
