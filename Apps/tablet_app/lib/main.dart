import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'login_screen.dart';
import 'dashboard_vereador_screen.dart';
import 'services/auth_service.dart';
import 'services/update_service.dart';

/// Starts the Flutter application and ensures framework services are ready.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CamaraDigitalApp());
}

/// Root widget that configures the application theme, routes, and first screen.
class CamaraDigitalApp extends StatelessWidget {
  /// Creates the Câmara Digital application shell.
  const CamaraDigitalApp({super.key});

  /// Builds the app-wide Material configuration and navigation routes.
  @override
  Widget build(BuildContext context) {
    const Color corFundoPrincipal = Color(0xFF1C1C1E);
    const Color corFundoCard = Color(0xFF2C2C2E);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Câmara Digital',
      theme: ThemeData(
        brightness: Brightness.dark,
        primarySwatch: Colors.blue,
        scaffoldBackgroundColor: corFundoPrincipal,
        fontFamily: 'Inter',
        cardTheme: CardThemeData(
          elevation: 0,
          color: corFundoCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: corFundoPrincipal,
          hintStyle: TextStyle(color: Colors.grey[600]),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8.0),
            borderSide: BorderSide(color: Colors.grey[800]!),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8.0),
            borderSide: const BorderSide(color: Color(0xFF58A6FF)),
          ),
        ),
      ),
      home: const SplashScreen(),
      routes: {
        '/login': (context) => const LoginScreen(),
        '/dashboard': (context) => const DashboardVereadorScreen(),
      },
    );
  }
}

/// Initial screen responsible for checking updates and restoring authentication.
class SplashScreen extends StatefulWidget {
  /// Creates the splash screen used during startup initialization.
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

/// Handles startup tasks before routing the user to the proper screen.
class _SplashScreenState extends State<SplashScreen> {
  /// Starts the asynchronous initialization flow after the widget is inserted.
  @override
  void initState() {
    super.initState();
    _initializeApp();
  }

  /// Checks for available updates, attempts auto-login, and redirects the user.
  Future<void> _initializeApp() async {
    final updateData = await UpdateService.checkForUpdate();
    if (updateData != null && mounted) {
      await _showUpdateDialog(updateData);
    }

    final isLoggedIn = await AuthService.tryAutoLogin();

    if (!mounted) return;
    if (isLoggedIn) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    } else {
      Navigator.of(context).pushReplacementNamed('/login');
    }
  }

  /// Displays the update prompt using metadata returned by [UpdateService].
  ///
  /// The [data] map is expected to include the target version, release notes,
  /// APK URL, and whether the update is required.
  Future<void> _showUpdateDialog(Map<String, dynamic> data) async {
    return showDialog(
      context: context,
      barrierDismissible: !(data['required'] ?? false),
      builder: (context) => AlertDialog(
        title: const Text('Nova Atualização Disponível 🚀'),
        content: Text(
          'Versão ${data['version']} está disponível.\n\n${data['notes'] ?? "Melhorias gerais."}',
        ),
        actions: [
          if (!(data['required'] ?? false))
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Depois'),
            ),
          ElevatedButton(
            onPressed: () {
              UpdateService.launchDownloadUrl(data['apkUrl']);
            },
            child: const Text('Baixar Agora'),
          ),
        ],
      ),
    );
  }

  /// Builds a minimal loading view while startup checks are running.
  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
