import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

/// Handles authentication, persisted session state, and authenticated API calls.
class AuthService {
  /// Backend URL override supplied at build time through TABLET_BACKEND_URL.
  static const String _envBaseUrl = String.fromEnvironment(
    'TABLET_BACKEND_URL',
    defaultValue: '',
  );

  /// Returns the tablet backend base URL for the current build mode.
  static String get baseUrl {
    if (_envBaseUrl.isNotEmpty) return _envBaseUrl;
    if (kReleaseMode) return 'https://legislanet.com.br/tablet-api';
    return 'http://127.0.0.1:3001';
  }

  /// Current bearer token used for authenticated requests.
  static String? _token;

  /// Current authenticated user payload returned by the backend.
  static Map<String, dynamic>? _currentUser;

  /// Prevents concurrent login attempts during automatic re-authentication.
  static bool _isRelogging = false;

  /// Returns the current authenticated user payload, if available.
  static Map<String, dynamic>? get currentUser => _currentUser;

  /// Returns the current bearer token, if available.
  static String? get token => _token;

  /// Whether a token and user payload are loaded in memory.
  static bool get isLoggedIn => _token != null && _currentUser != null;

  /// Attempts to restore a persisted session from the device.
  ///
  /// Returns `true` when a cached session is valid or automatic re-login
  /// succeeds. Expired sessions are cleared when re-login is not possible.
  static Future<bool> tryAutoLogin() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!prefs.containsKey('userData')) return false;

      final extractedUserData =
          json.decode(prefs.getString('userData')!) as Map<String, dynamic>;

      _token = extractedUserData['token'];
      _currentUser = extractedUserData['user'];

      print('💾 [AuthService] Sessão restaurada do cache local');

      final isValid = await validateToken();
      if (!isValid) {
        print('⚠️ [AuthService] Token expirado, tentando re-login...');

        final credentials = prefs.getString('credentials');
        if (credentials != null) {
          try {
            final creds = json.decode(credentials) as Map<String, dynamic>;
            final result = await login(creds['email'], creds['password']);
            if (result['success'] == true) {
              print('✅ [AuthService] Re-login automático bem-sucedido');
              return true;
            }
          } catch (e) {
            print('❌ [AuthService] Falha no re-login: $e');
          }
        }

        await logout();
        return false;
      }

      return true;
    } catch (e) {
      print('❌ [AuthService] Falha ao restaurar sessão: $e');
      return false;
    }
  }

  /// Authenticates a council member and persists the session on the device.
  ///
  /// The [email] and [password] are sent to the login endpoint. A successful
  /// response must contain a user with the `vereador` role.
  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    if (_isRelogging) {
      return {'success': false, 'error': 'Re-login em andamento'};
    }

    final url = '$baseUrl/api/auth/login';
    print('🔐 [AuthService] Tentando login em: $url');

    try {
      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      );

      print('📡 [AuthService] Status: ${response.statusCode}');
      final responseData = jsonDecode(response.body);

      if (response.statusCode == 200) {
        _token = responseData['token'];
        _currentUser = responseData['user'];

        if (_currentUser?['role'] != 'vereador') {
          throw Exception('Acesso restrito a vereadores');
        }

        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(
          'userData',
          json.encode({'token': _token, 'user': _currentUser}),
        );
        await prefs.setString(
          'credentials',
          json.encode({'email': email, 'password': password}),
        );

        return {'success': true, 'user': _currentUser, 'token': _token};
      } else {
        return {
          'success': false,
          'error': responseData['error'] ?? 'Erro desconhecido',
        };
      }
    } catch (e) {
      print('❌ [AuthService] Erro de conexão: $e');
      return {'success': false, 'error': 'Erro de conexão: ${e.toString()}'};
    }
  }

  /// Fetches the full profile for the currently authenticated council member.
  static Future<Map<String, dynamic>?> getVereadorDetails() async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/vereador/profile'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('❌ [AuthService] Erro ao buscar perfil: $e');
    }
    return null;
  }

  /// Logs out from the backend and clears persisted local session data.
  static Future<void> logout() async {
    if (_token != null) {
      try {
        await http.post(
          Uri.parse('$baseUrl/api/auth/logout'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $_token',
          },
        );
      } catch (e) {
        print('Erro ao fazer logout no servidor: $e');
      }
    }

    _token = null;
    _currentUser = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  /// Checks whether the current token is still accepted by the backend.
  ///
  /// Network failures are treated as non-fatal so an offline device does not
  /// immediately lose its cached session.
  static Future<bool> validateToken() async {
    if (!isLoggedIn) return false;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/vereador/profile'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 401 || response.statusCode == 403) {
        return false;
      }
      return true;
    } catch (e) {
      print('⚠️ [AuthService] Erro ao validar token (offline): $e');
      return true;
    }
  }

  /// Fetches paginated agenda items for the council chamber.
  ///
  /// The [page] and [limit] values are forwarded as query parameters.
  static Future<Map<String, dynamic>?> getPautas({
    int page = 1,
    int limit = 50,
  }) async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/pautas?page=$page&limit=$limit'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('❌ [AuthService] Erro ao buscar pautas: $e');
    }
    return null;
  }

  /// Fetches one agenda item by [pautaId].
  static Future<Map<String, dynamic>?> getPautaById(String pautaId) async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/pautas/$pautaId'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('❌ [AuthService] Erro ao buscar pauta por ID: $e');
    }
    return null;
  }

  /// Registers the authenticated council member vote for an agenda item.
  ///
  /// Sends [voto] for the agenda identified by [pautaId].
  static Future<Map<String, dynamic>?> registrarVoto(
    String pautaId,
    String voto,
  ) async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.post(
        Uri.parse('$baseUrl/api/votos'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
        body: jsonEncode({'pauta_id': pautaId, 'voto': voto}),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return jsonDecode(response.body);
      } else {
        final errorData = jsonDecode(response.body);
        return {
          'success': false,
          'error': errorData['error'] ?? 'Erro ao registrar voto',
        };
      }
    } catch (e) {
      print('❌ [AuthService] Erro ao registrar voto: $e');
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  /// Fetches all votes already cast by the authenticated council member.
  static Future<Map<String, dynamic>?> getVotosVereador() async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/votos/meus-votos'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('❌ [AuthService] Erro ao buscar votos: $e');
    }
    return null;
  }

  /// Fetches vote statistics for the agenda identified by [pautaId].
  static Future<Map<String, dynamic>?> getEstatisticasPauta(
    String pautaId,
  ) async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/votos/pauta/$pautaId/estatisticas'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('❌ [AuthService] Erro ao buscar estatísticas: $e');
    }
    return null;
  }

  /// Fetches live voting status for the chamber identified by [camaraId].
  ///
  /// This is a best-effort call used by the dashboard to confirm which agenda
  /// items are actively live.
  static Future<Map<String, dynamic>?> getLiveVotingStatus(
    String camaraId,
  ) async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/votacao-ao-vivo/status/$camaraId'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('⚠️ [AuthService] getLiveVotingStatus indisponível: $e');
    }
    return null;
  }

  /// Fetches the authenticated council member vote for one agenda item.
  static Future<Map<String, dynamic>?> getVotoEmPauta(String pautaId) async {
    if (!isLoggedIn) return null;

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/votos/pauta/$pautaId'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      if (response.statusCode == 200) return jsonDecode(response.body);
    } catch (e) {
      print('❌ [AuthService] Erro ao buscar voto em pauta: $e');
    }
    return null;
  }
}
