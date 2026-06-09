import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'auth_service.dart';

/// Checks for tablet app updates and opens update download links.
class UpdateService {
  /// Fetches remote version metadata and returns it only when it is newer.
  static Future<Map<String, dynamic>?> checkForUpdate() async {
    try {
      final baseUrl = AuthService.baseUrl;
      print(
        '🔄 [UpdateService] Verificando atualizações em: $baseUrl/api/system/version',
      );

      final response = await http.get(
        Uri.parse('$baseUrl/api/system/version'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final remoteData = jsonDecode(response.body);
        final remoteVersion = remoteData['version'];

        final packageInfo = await PackageInfo.fromPlatform();
        final currentVersion = packageInfo.version;

        print(
          '📦 Versão Atual: $currentVersion | Versão Remota: $remoteVersion',
        );

        if (_isNewer(remoteVersion, currentVersion)) {
          return remoteData;
        }
      }
    } catch (e) {
      print('❌ [UpdateService] Erro ao verificar atualização: $e');
    }
    return null;
  }

  /// Compares semantic version cores and ignores build or prerelease suffixes.
  static bool _isNewer(String remote, String current) {
    try {
      // Compare only the major.minor.patch core.
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

  /// Opens the update download URL in an external application.
  static Future<void> launchDownloadUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      print('❌ [UpdateService] Não foi possível abrir URL: $url');
    }
  }
}
