import 'package:flutter/material.dart';
import 'services/auth_service.dart';

/// Color tokens shared by the tablet login screen.
class AppColors {
  static const Color backgroundDark = Color(0xFF0D1117);
  static const Color backgroundLight = Color(0xFF161B22);
  static const Color cardBg = Color(0xFF161B22);
  static const Color hoverBg = Color(0xFF21262D);
  static const Color borderColor = Color(0xFF30363D);
  static const Color primaryText = Color(0xFFE6EDF3);
  static const Color secondaryText = Color(0xFF8B949E);
  static const Color accentBlue = Color(0xFF58A6FF);
  static const Color accentGreen = Color(0xFF2EA043);
}

/// Authentication screen for the tablet application.
class LoginScreen extends StatefulWidget {
  /// Creates the tablet login screen.
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

/// Manages login form state, validation, and authentication navigation.
class _LoginScreenState extends State<LoginScreen> {
  bool _isPasswordVisible = false;
  bool _isLoading = false;
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  /// Validates credentials, calls the authentication service, and opens the dashboard on success.
  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      _showError('Por favor, preencha todos os campos');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final result = await AuthService.login(email, password);

      if (result['success']) {
        if (!mounted) return;
        Navigator.of(context).pushReplacementNamed('/dashboard');
      } else {
        _showError(result['error'] ?? 'Erro desconhecido');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  /// Shows a floating error message for validation or authentication failures.
  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.accentBlue,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          color: AppColors.backgroundDark,
          gradient: LinearGradient(
            begin: Alignment(-0.7071, -0.7071),
            end: Alignment(0.7071, 0.7071),
            colors: [
              Color.fromRGBO(88, 166, 255, 0.08),
              Color.fromRGBO(46, 160, 67, 0.06),
              Color.fromRGBO(138, 58, 185, 0.05),
              Color.fromRGBO(240, 136, 51, 0.07),
              Color.fromRGBO(88, 166, 255, 0.04),
            ],
            stops: [0.0, 0.25, 0.5, 0.75, 1.0],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              left: MediaQuery.of(context).size.width * 0.2 - 200,
              top: MediaQuery.of(context).size.height * 0.3 - 200,
              child: Container(
                width: 400,
                height: 400,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center,
                    radius: 0.6,
                    colors: [
                      const Color.fromRGBO(46, 160, 67, 0.05),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.6],
                  ),
                ),
              ),
            ),
            Positioned(
              left: MediaQuery.of(context).size.width * 0.8 - 200,
              top: MediaQuery.of(context).size.height * 0.7 - 200,
              child: Container(
                width: 400,
                height: 400,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center,
                    radius: 0.6,
                    colors: [
                      const Color.fromRGBO(138, 58, 185, 0.04),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.6],
                  ),
                ),
              ),
            ),
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildLogo(),
                  const SizedBox(height: 40),

                  _buildLoginCard(),
                ],
              ),
            ),
          ),
        ),
          ],
        ),
      ),
    );
  }

  /// Builds the application logo and product name.
  Widget _buildLogo() {
    return Column(
      children: [
        _buildCustomLogo(),
        const SizedBox(height: 12),
        const Text(
          'Legisla Net',
          style: TextStyle(
            color: AppColors.primaryText,
            fontSize: 22,
            fontWeight: FontWeight.w600,
            fontFamily: 'Inter',
          ),
        ),
      ],
    );
  }

  /// Builds the custom painted Legisla Net logo.
  Widget _buildCustomLogo() {
    return SizedBox(
      width: 44,
      height: 40,
      child: CustomPaint(
        painter: LogoPainter(),
      ),
    );
  }

  /// Builds the login form card with credentials, recovery link, and submit button.
  Widget _buildLoginCard() {
    return Container(
      padding: const EdgeInsets.all(32.0),
      decoration: BoxDecoration(
        color: AppColors.cardBg.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(8.0),
        border: Border.all(color: AppColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Acesse sua conta',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.primaryText,
              fontSize: 20,
              fontWeight: FontWeight.w600,
              fontFamily: 'Inter',
            ),
          ),
          const SizedBox(height: 24),
          _buildEmailField(),
          const SizedBox(height: 16),
          _buildPasswordField(),
          const SizedBox(height: 8),
          _buildForgotPasswordLink(),
          const SizedBox(height: 24),
          _buildLoginButton(),
        ],
      ),
    );
  }

  /// Builds the email input field used by [_handleLogin].
  Widget _buildEmailField() {
    return TextFormField(
      controller: _emailController,
      keyboardType: TextInputType.emailAddress,
      style: const TextStyle(color: AppColors.primaryText, fontFamily: 'Inter'),
      decoration: InputDecoration(
        hintText: 'Digite seu email',
        prefixIcon: const Icon(
          Icons.email_outlined,
          color: AppColors.secondaryText,
          size: 20,
        ),
        filled: true,
        fillColor: AppColors.hoverBg,
        hintStyle: const TextStyle(
          color: AppColors.secondaryText,
          fontFamily: 'Inter',
        ),
        contentPadding: const EdgeInsets.symmetric(
          vertical: 14,
          horizontal: 12,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6.0),
          borderSide: const BorderSide(color: AppColors.borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6.0),
          borderSide: const BorderSide(color: AppColors.accentBlue),
        ),
      ),
    );
  }

  /// Builds the password input field and visibility toggle.
  Widget _buildPasswordField() {
    return TextFormField(
      controller: _passwordController,
      obscureText: !_isPasswordVisible,
      style: const TextStyle(color: AppColors.primaryText, fontFamily: 'Inter'),
      decoration: InputDecoration(
        hintText: 'Digite sua senha',
        prefixIcon: const Icon(
          Icons.lock_outline,
          color: AppColors.secondaryText,
          size: 20,
        ),
        suffixIcon: IconButton(
          icon: Icon(
            _isPasswordVisible
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
            color: AppColors.secondaryText,
            size: 20,
          ),
          onPressed: () {
            setState(() {
              _isPasswordVisible = !_isPasswordVisible;
            });
          },
        ),
        filled: true,
        fillColor: AppColors.hoverBg,
        hintStyle: const TextStyle(
          color: AppColors.secondaryText,
          fontFamily: 'Inter',
        ),
        contentPadding: const EdgeInsets.symmetric(
          vertical: 14,
          horizontal: 12,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6.0),
          borderSide: const BorderSide(color: AppColors.borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(6.0),
          borderSide: const BorderSide(color: AppColors.accentBlue),
        ),
      ),
    );
  }

  /// Builds the password recovery action placeholder.
  Widget _buildForgotPasswordLink() {
    return Align(
      alignment: Alignment.centerRight,
      child: TextButton(
        onPressed: () {
        },
        child: const Text(
          'Esqueceu sua senha?',
          style: TextStyle(
            color: AppColors.accentBlue,
            fontSize: 14,
            fontFamily: 'Inter',
          ),
        ),
      ),
    );
  }

  /// Builds the submit button and loading indicator for the authentication request.
  Widget _buildLoginButton() {
    return ElevatedButton(
      onPressed: _isLoading ? null : _handleLogin,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accentGreen,
        padding: const EdgeInsets.symmetric(vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6.0)),
      ),
      child: _isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2,
              ),
            )
          : const Text(
              'Entrar',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                fontFamily: 'Inter',
              ),
            ),
    );
  }
}

/// Paints the Legisla Net logo with the native Flutter gradient.
class LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final gradient = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        AppColors.accentBlue,
        AppColors.accentGreen,
      ],
    );

    final paint = Paint()
      ..shader = gradient.createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final column1 = Path()
      ..moveTo(8, 5)
      ..lineTo(8, 35)
      ..lineTo(14, 35)
      ..lineTo(14, 5)
      ..close();

    final column2 = Path()
      ..moveTo(19, 5)
      ..lineTo(19, 35)
      ..lineTo(25, 35)
      ..lineTo(25, 5)
      ..close();

    final column3 = Path()
      ..moveTo(30, 5)
      ..lineTo(30, 35)
      ..lineTo(36, 35)
      ..lineTo(36, 5)
      ..close();

    final base = Path()
      ..moveTo(5, 35)
      ..lineTo(39, 35)
      ..lineTo(39, 40)
      ..lineTo(5, 40)
      ..close();

    canvas.drawPath(column1, paint);
    canvas.drawPath(column2, paint);
    canvas.drawPath(column3, paint);
    canvas.drawPath(base, paint);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}
