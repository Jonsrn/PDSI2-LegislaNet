import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'auth_service.dart';

/// Handles APK update checks and download URL launching.
class UpdateService {
  /// Checks whether the server has a newer APK version available.
  ///
  /// Returns the remote version metadata when an update is available, otherwise
  /// returns `null`.
  static Future<Map<String, dynamic>?> checkForUpdate() async {
    try {
      final baseUrl = AuthService.baseUrl;
      print('🔄 [UpdateService] Verificando atualizações em: $baseUrl/api/system/version');

      final response = await http.get(
        Uri.parse('$baseUrl/api/system/version'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final remoteData = jsonDecode(response.body);
        final remoteVersion = remoteData['version'];

        final packageInfo = await PackageInfo.fromPlatform();
        final currentVersion = packageInfo.version;

        print('📦 Versão atual: $currentVersion | Versão remota: $remoteVersion');

        if (_isNewer(remoteVersion, currentVersion)) {
          return remoteData;
        }
      }
    } catch (e) {
      print('❌ [UpdateService] Erro ao verificar atualização: $e');
    }
    return null;
  }

  /// Returns whether [remote] is newer than [current].
  ///
  /// Compares semantic version strings using the `major.minor.patch` segments
  /// and ignores build metadata or pre-release suffixes.
  static bool _isNewer(String remote, String current) {
    try {
      final r = remote.split('+')[0].split('-')[0].split('.');
      final c = current.split('+')[0].split('-')[0].split('.');

      for (int i = 0; i < 3; i++) {
        final rNum = int.parse(r[i]);
        final cNum = int.parse(c[i]);
        if (rNum > cNum) return true;
        if (rNum < cNum) return false;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /// Opens the APK download [url] in an external application.
  static Future<void> launchDownloadUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      print('❌ [UpdateService] Não foi possível abrir URL: $url');
    }
  }
}
