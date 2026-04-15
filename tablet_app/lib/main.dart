import 'package:flutter/material.dart';
import 'login_screen.dart'; // Importação Relativa

/// Starts the Flutter application.
///
/// This function initializes the widget tree by launching
/// [CamaraDigitalApp] as the root widget.
void main() {
  runApp(const CamaraDigitalApp());
}

/// Configures the root application widget for the digital council app.
///
/// This widget defines the global dark theme, application title, and initial
/// route shown to the user.
class CamaraDigitalApp extends StatelessWidget {
  /// Creates the root application widget.
  ///
  /// Args:
  ///   key: The widget key used to preserve this widget's identity in the
  ///     widget tree.
  const CamaraDigitalApp({super.key});

  @override
  /// Builds the root [MaterialApp] with the shared theme configuration.
  ///
  /// Args:
  ///   context: The build context used to access inherited widgets and theme
  ///     dependencies.
  ///
  /// Returns:
  ///   A [MaterialApp] configured with the application's theme and initial
  ///   login screen.
  Widget build(BuildContext context) {
    // Cores mais claras para o tema escuro
    const Color corFundoPrincipal = Color(
      0xFF1C1C1E,
    ); // Um cinza escuro, quase preto
    const Color corFundoCard = Color(
      0xFF2C2C2E,
    ); // Um cinza um pouco mais claro

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
      home: const LoginScreen(),
    );
  }
}
