import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

/// Handles tablet authentication, persisted session state, and authenticated API calls.
class AuthService {
  static const String _envBaseUrl = String.fromEnvironment(
    'TABLET_BACKEND_URL',
    defaultValue: '',
  );

  /// Backend base URL selected from environment, release, or local development defaults.
  static String get baseUrl {
    if (_envBaseUrl.isNotEmpty) {
      return _envBaseUrl;
    }

    if (kReleaseMode) {
      return 'https://legislanet.com.br/tablet-api';
    }

    return 'http://127.0.0.1:3003';
  }

  static String? _token;
  static Map<String, dynamic>? _currentUser;
  static bool _isRelogging = false;

  /// Current authenticated user payload, if a session is active.
  static Map<String, dynamic>? get currentUser => _currentUser;

  /// Current bearer token, if a session is active.
  static String? get token => _token;

  /// Whether both token and user data are available in memory.
  static bool get isLoggedIn => _token != null && _currentUser != null;

  /// Restores a saved session and validates it before allowing automatic login.
  ///
  /// If the token is rejected by the backend, the method attempts a re-login
  /// using saved credentials. When recovery fails, local authentication state is cleared.
  static Future<bool> tryAutoLogin() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!prefs.containsKey('userData')) {
        return false;
      }

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

  /// Authenticates a council member and persists token, user data, and credentials.
  ///
  /// Returns a map with `success`, and on success includes `user` and `token`.
  /// Access is restricted to users whose `role` is `vereador`.
  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    if (_isRelogging) {
      return {'success': false, 'error': 'Re-login em andamento'};
    }

    final url = '$baseUrl/api/auth/login';
    print('🔐 [AuthService] Tentando login em: $url');
    print('📧 [AuthService] Email: $email');

    try {
      final response = await http.post(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      );

      print('📡 [AuthService] Status da resposta: ${response.statusCode}');
      print('📄 [AuthService] Response body: ${response.body}');

      final responseData = jsonDecode(response.body);

      if (response.statusCode == 200) {
        _token = responseData['token'];
        _currentUser = responseData['user'];

        if (_currentUser?['role'] != 'vereador') {
          throw Exception('Acesso restrito a vereadores');
        }

        final prefs = await SharedPreferences.getInstance();
        final userData = json.encode({'token': _token, 'user': _currentUser});
        await prefs.setString('userData', userData);

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

  /// Fetches the authenticated council member profile.
  static Future<Map<String, dynamic>?> getVereadorDetails() async {
    if (!isLoggedIn) {
      return null;
    }

    try {
      print('🔍 Buscando dados do vereador em: $baseUrl/api/vereador/profile');
      final response = await http.get(
        Uri.parse('$baseUrl/api/vereador/profile'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status da resposta: ${response.statusCode}');
      print('📄 Response body: ${response.body}');

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print(
          '❌ Erro ao buscar perfil: ${response.statusCode} - ${response.body}',
        );
      }
    } catch (e) {
      print('❌ Erro ao buscar detalhes do vereador: $e');
    }
    return null;
  }

  /// Logs out from the backend when possible and clears all persisted auth data.
  static Future<void> logout() async {
    if (_token != null) {
      try {
        await http.post(
          Uri.parse('$baseUrl/auth/logout'),
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

  /// Validates the current token without logging the user out on temporary network errors.
  ///
  /// Only `401` and `403` responses invalidate the session. Other responses and
  /// connection failures are treated as recoverable so offline tablets keep their session.
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
      print('⚠️ [AuthService] Erro ao validar token (offline/rede): $e');
      return true;
    }
  }

  /// Fetches a paginated agenda list for the authenticated council member.
  static Future<Map<String, dynamic>?> getPautas({
    int page = 1,
    int limit = 50,
  }) async {
    if (!isLoggedIn) return null;

    try {
      print('🔍 Buscando pautas: $baseUrl/api/pautas?page=$page&limit=$limit');
      final response = await http.get(
        Uri.parse('$baseUrl/api/pautas?page=$page&limit=$limit'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status pautas: ${response.statusCode}');
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print(
          '❌ Erro ao buscar pautas: ${response.statusCode} - ${response.body}',
        );
      }
    } catch (e) {
      print('❌ Erro ao buscar pautas: $e');
    }
    return null;
  }

  /// Fetches a single agenda by ID without reloading paginated agenda lists.
  static Future<Map<String, dynamic>?> getPautaById(String pautaId) async {
    if (!isLoggedIn) return null;

    try {
      print('🔍 Buscando pauta por ID: $baseUrl/api/pautas/$pautaId');
      final response = await http.get(
        Uri.parse('$baseUrl/api/pautas/$pautaId'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status pautaById: ${response.statusCode}');
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print(
          '❌ Erro ao buscar pauta por ID: ${response.statusCode} - ${response.body}',
        );
      }
    } catch (e) {
      print('❌ Erro ao buscar pauta por ID: $e');
    }

    return null;
  }

  /// Registers the authenticated council member's vote for an agenda.
  ///
  /// Returns the decoded backend response on success, or a map containing
  /// `success: false` and `error` when the backend rejects the vote.
  static Future<Map<String, dynamic>?> registrarVoto(
    String pautaId,
    String voto,
  ) async {
    if (!isLoggedIn) return null;

    try {
      print('🗳️ Registrando voto: $voto na pauta $pautaId');
      final response = await http.post(
        Uri.parse('$baseUrl/api/votos'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
        body: jsonEncode({'pauta_id': pautaId, 'voto': voto}),
      );

      print('📡 Status voto: ${response.statusCode}');
      print('📄 Response voto: ${response.body}');

      if (response.statusCode == 200 || response.statusCode == 201) {
        return jsonDecode(response.body);
      } else {
        print(
          '❌ Erro ao registrar voto: ${response.statusCode} - ${response.body}',
        );
        final errorData = jsonDecode(response.body);
        return {
          'success': false,
          'error': errorData['error'] ?? 'Erro ao registrar voto',
        };
      }
    } catch (e) {
      print('❌ Erro ao registrar voto: $e');
      return {'success': false, 'error': 'Erro de conexão: $e'};
    }
  }

  /// Fetches all votes recorded by the authenticated council member.
  static Future<Map<String, dynamic>?> getVotosVereador() async {
    if (!isLoggedIn) return null;

    try {
      print('🔍 Buscando votos do vereador: $baseUrl/api/votos/meus-votos');
      final response = await http.get(
        Uri.parse('$baseUrl/api/votos/meus-votos'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status votos: ${response.statusCode}');
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print(
          '❌ Erro ao buscar votos: ${response.statusCode} - ${response.body}',
        );
      }
    } catch (e) {
      print('❌ Erro ao buscar votos: $e');
    }
    return null;
  }

  /// Fetches vote statistics for a specific agenda.
  static Future<Map<String, dynamic>?> getEstatisticasPauta(
    String pautaId,
  ) async {
    if (!isLoggedIn) return null;

    try {
      print(
        '📊 Buscando estatísticas da pauta: $baseUrl/api/votos/pauta/$pautaId/estatisticas',
      );
      final response = await http.get(
        Uri.parse('$baseUrl/api/votos/pauta/$pautaId/estatisticas'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status estatísticas: ${response.statusCode}');
      print('📄 Response estatísticas: ${response.body}');

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      } else {
        print(
          '❌ Erro ao buscar estatísticas: ${response.statusCode} - ${response.body}',
        );
      }
    } catch (e) {
      print('❌ Erro ao buscar estatísticas: $e');
    }
    return null;
  }

  /// Fetches the authenticated council member's vote for a specific agenda.
  static Future<Map<String, dynamic>?> getVotoEmPauta(String pautaId) async {
    if (!isLoggedIn) return null;

    try {
      print('🔍 Verificando voto em pauta: $baseUrl/api/votos/pauta/$pautaId');
      final response = await http.get(
        Uri.parse('$baseUrl/api/votos/pauta/$pautaId'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status voto em pauta: ${response.statusCode}');
      print('📄 Response voto em pauta: ${response.body}');

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      print('❌ Erro ao buscar voto em pauta: $e');
    }
    return null;
  }

  /// Fetches live-voting status for a chamber to identify active agenda sessions.
  static Future<Map<String, dynamic>?> getLiveVotingStatus(
    String camaraId,
  ) async {
    if (!isLoggedIn) return null;

    try {
      print(
        '🔍 Buscando status ao vivo: $baseUrl/api/votacao-ao-vivo/status/$camaraId',
      );
      final response = await http.get(
        Uri.parse('$baseUrl/api/votacao-ao-vivo/status/$camaraId'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_token',
        },
      );

      print('📡 Status ao vivo: ${response.statusCode}');
      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      print('❌ Erro ao buscar status ao vivo: $e');
    }
    return null;
  }
}
